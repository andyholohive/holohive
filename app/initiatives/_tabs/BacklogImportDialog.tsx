'use client';

/**
 * BacklogImportDialog — bulk-seed the backlog from a freeform paste.
 *
 * Phase 6 of the HHP Backlog Tab spec (Jdot, 2026-06-08). Andy uses
 * this once to migrate Quazo's existing weekly summary into the new
 * board; after that, the dialog is dormant but still useful if the
 * team ever needs to drop a batch in (e.g. retro action items).
 *
 * Why a paste-textarea instead of a CSV upload:
 *   • Quazo's existing summary lives in plain Telegram messages —
 *     no schema to start from. Paste-from-chat is the natural input.
 *   • Each line gets parsed by the SAME parser used by the /bug
 *     command (lib/backlogTelegramParser). Lets Andy use the
 *     "/bug #area description" syntax he already knows, or drop the
 *     prefix and accept the defaults (bug + other).
 *   • Live preview shows how each line will land before committing,
 *     so typos in the area tag don't silently land as "other."
 *
 * Gating: only renders for super_admin. Trigger lives in the
 * BacklogTab toolbar with the same gate.
 */

import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  BacklogService,
  BACKLOG_AREA_LABELS,
  BACKLOG_TYPE_LABELS,
  type BacklogArea,
  type BacklogType,
} from '@/lib/backlogService';
import { parseBacklogCommand } from '@/lib/backlogTelegramParser';

type ParsedLine = {
  raw: string;
  type: BacklogType;
  area: BacklogArea;
  title: string;
  description: string;
};

/**
 * Parse one input line. Auto-detects type via leading "/bug" / "/req"
 * or "[bug]" / "[req]" prefix; otherwise falls back to the dialog's
 * default-type select. Uses the same hashtag-area syntax as the TG
 * command — anything not matching defaults to area = 'other'.
 *
 * Examples:
 *   "/bug #content-dashboard table headers misaligned"
 *   "[req] add duplicate KOL action"
 *   "fix the login flow"  → uses defaults
 */
function parseLine(line: string, defaultType: BacklogType): ParsedLine | null {
  const raw = line.trim();
  if (!raw) return null;

  // Detect explicit type marker. Accept three forms so paste is
  // forgiving: "/bug ", "/req ", "[bug] ", "[req] ", or plain
  // "bug: " / "req: " at the start.
  let type: BacklogType = defaultType;
  let body = raw;
  const explicitMatch = raw.match(/^(?:\/|\[)?(bug|req|request)(?:\]|:)?\s+(.*)/i);
  if (explicitMatch) {
    type = explicitMatch[1].toLowerCase().startsWith('bug') ? 'bug' : 'request';
    body = explicitMatch[2];
  }

  // Reuse the TG parser for hashtag → area + title extraction.
  // The parser strips a leading "/bug" or "/req" itself; we feed it
  // a synthetic prefix so it parses uniformly.
  const synthetic = `/${type === 'bug' ? 'bug' : 'req'} ${body}`;
  const parsed = parseBacklogCommand(synthetic);
  if (parsed.description === '(no description)') return null;

  return {
    raw,
    type,
    area: parsed.area,
    title: parsed.title,
    description: parsed.description,
  };
}

export default function BacklogImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [defaultType, setDefaultType] = useState<BacklogType>('bug');
  const [submitting, setSubmitting] = useState(false);

  const lines = useMemo(() => text.split('\n'), [text]);

  // Parse each line in real time so Andy can see what'll land. Bad
  // lines (empty / unparseable) get filtered out of the actual import.
  const parsed = useMemo<Array<{ index: number; result: ParsedLine | null }>>(() => {
    return lines.map((line, idx) => ({
      index: idx,
      result: parseLine(line, defaultType),
    }));
  }, [lines, defaultType]);

  const validCount = parsed.filter(p => p.result !== null).length;
  const skipCount = parsed.filter(p => p.result === null && p.index < lines.length - 1).length;

  const handleImport = async () => {
    if (!userProfile || validCount === 0) return;
    setSubmitting(true);
    const created: number[] = [];
    const failures: Array<{ index: number; raw: string; error: string }> = [];
    try {
      for (const p of parsed) {
        if (!p.result) continue;
        try {
          await BacklogService.create({
            type: p.result.type,
            area: p.result.area,
            title: p.result.title,
            description: p.result.description,
            reporter_id: userProfile.id,
            source: 'seed',
          });
          created.push(p.index);
        } catch (err) {
          failures.push({
            index: p.index,
            raw: p.result.raw,
            error: (err as Error).message,
          });
        }
      }
      if (failures.length === 0) {
        toast({
          title: `Imported ${created.length} item${created.length === 1 ? '' : 's'}`,
        });
        await onImported();
        setText('');
        onClose();
      } else {
        toast({
          title: `Imported ${created.length} of ${created.length + failures.length}`,
          description: `${failures.length} failed — see the dialog.`,
          variant: 'destructive',
        });
        // Replace text with only the failed lines so the user can retry.
        setText(failures.map(f => f.raw).join('\n'));
        await onImported();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!userProfile || userProfile.role !== 'super_admin') return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-brand" />
            Bulk import backlog items
          </DialogTitle>
          <DialogDescription>
            One item per line. Use <code className="text-[11px] bg-cream-100 px-1 rounded">/bug #area-tag title</code> or <code className="text-[11px] bg-cream-100 px-1 rounded">/req #area title</code> to override defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4">
          {/* Default type — used for lines without an explicit prefix.
              Most paste-from-chat batches are predominantly one type, so
              picking it once saves typing per line. */}
          <div className="grid gap-1.5">
            <Label>Default type when not specified</Label>
            <Select value={defaultType} onValueChange={(v) => setDefaultType(v as BacklogType)}>
              <SelectTrigger className="focus-brand w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">{BACKLOG_TYPE_LABELS.bug}</SelectItem>
                <SelectItem value="request">{BACKLOG_TYPE_LABELS.request}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Paste area */}
          <div className="grid gap-1.5">
            <Label htmlFor="bl-bulk">Items <RequiredAsterisk /></Label>
            <Textarea
              id="bl-bulk"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                'login flow throws 500 on submit\n'
                + '/bug #content-dashboard table headers misaligned on mobile\n'
                + '/req #kol-cards add duplicate action\n'
                + '[req] dark mode for the portal'
              }
              className="focus-brand font-mono text-xs min-h-[200px]"
              rows={10}
              spellCheck={false}
            />
          </div>

          {/* Live parse preview */}
          {validCount > 0 && (
            <div className="border border-cream-200 rounded-md overflow-hidden">
              <div className="bg-cream-50 px-3 py-2 border-b border-cream-100 flex items-center gap-2 text-xs">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-semibold text-ink-warm-700">
                  {validCount} valid item{validCount === 1 ? '' : 's'}
                </span>
                {skipCount > 0 && (
                  <span className="text-ink-warm-500">
                    · {skipCount} skipped (empty / unparseable)
                  </span>
                )}
              </div>
              <ul className="divide-y divide-cream-100 max-h-[240px] overflow-y-auto">
                {parsed.map(p => {
                  if (!p.result) return null;
                  return (
                    <li key={p.index} className="px-3 py-2 hover:bg-cream-50">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge tone={p.result.type === 'bug' ? 'danger' : 'info'} size="sm" bordered>
                          {BACKLOG_TYPE_LABELS[p.result.type]}
                        </StatusBadge>
                        <span className="text-[11px] bg-gray-100 text-ink-warm-700 px-1.5 py-0.5 rounded">
                          {BACKLOG_AREA_LABELS[p.result.area]}
                        </span>
                      </div>
                      <p className="text-xs text-ink-warm-900 truncate">{p.result.title}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {text.trim().length > 0 && validCount === 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-md p-3 flex items-start gap-2 text-xs text-amber-900">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                No parseable lines yet. Each line needs at least a description (and optionally a type/area prefix).
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="brand"
            onClick={handleImport}
            disabled={validCount === 0 || submitting}
          >
            {submitting ? 'Importing…' : `Import ${validCount} item${validCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
