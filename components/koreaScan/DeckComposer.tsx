'use client';

/**
 * Pick the story for one project: start from an angle the project's numbers
 * support (each says why it fits), then switch slides on or off and reorder
 * them. The deck beside it, and the shared link, follow the choice.
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { ArrowDown, ArrowUp, Sparkles } from 'lucide-react';
import type { KoreaScan } from '@/lib/koreaScan/compute';
import { SLIDES, anglesFor, slideMeta, type SlideId } from '@/lib/koreaScan/angles';
import type { KickerMode } from '@/lib/koreaScan/narrative';

export interface DeckChoice { slides: SlideId[]; kickers: KickerMode; angle: string | null }

/** The recommended starting deck for a scan. */
export function defaultDeck(s: KoreaScan, client = false): DeckChoice {
  const a = anglesFor(s, { client })[0];
  return { slides: a.slides, kickers: a.id === 'client-weekly' ? 'lifecycle' : 'verdict', angle: a.id };
}

export function DeckComposer({ s, value, onChange, client = false }: { s: KoreaScan; value: DeckChoice; onChange: (v: DeckChoice) => void; client?: boolean }) {
  const angles = anglesFor(s, { client });
  const available = SLIDES.filter((x) => x.available(s));
  const on = new Set(value.slides);
  const set = (slides: SlideId[], extra: Partial<DeckChoice> = {}) => onChange({ ...value, slides, angle: null, ...extra });

  function toggle(id: SlideId) {
    if (on.has(id)) { set(value.slides.filter((x) => x !== id)); return; }
    // Slot it in after the nearest slide that comes before it in the catalog,
    // leaving the order already chosen untouched.
    const order = available.map((x) => x.id);
    const before = order.slice(0, order.indexOf(id)).reverse().find((x) => on.has(x));
    const at = before ? value.slides.indexOf(before) + 1 : 0;
    set([...value.slides.slice(0, at), id, ...value.slides.slice(at)]);
  }
  function move(id: SlideId, d: -1 | 1) {
    const i = value.slides.indexOf(id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= value.slides.length) return;
    const next = [...value.slides];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Angles for {s.subject}</p>
        <div className="grid gap-2">
          {angles.map((a) => {
            const active = value.angle === a.id;
            return (
              <button key={a.id} type="button" onClick={() => onChange({ slides: a.slides, kickers: a.id === 'client-weekly' ? 'lifecycle' : 'verdict', angle: a.id })}
                className={`rounded-lg border p-3 text-left transition-colors focus-brand ${active ? 'border-brand bg-brand-light' : 'border-gray-200 bg-white hover:border-brand/40'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${active ? 'text-brand' : 'text-gray-900'}`}>{a.label}</span>
                  {a.recommended && <StatusBadge tone="brand" size="sm"><Sparkles className="mr-1 inline h-3 w-3" />Best fit</StatusBadge>}
                </span>
                <span className="mt-1 block text-xs leading-snug text-gray-600">{a.why}</span>
                <span className="mt-1.5 block text-[11px] text-gray-500">{a.slides.length} slides</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Slides</p>
          <span className="text-xs text-gray-500">{value.slides.length} on</span>
        </div>
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {[...value.slides.map((id) => slideMeta(id)), ...available.filter((x) => !on.has(x.id))].map((m) => {
            const i = value.slides.indexOf(m.id);
            const isOn = i >= 0;
            return (
              <li key={m.id} className={`flex items-start gap-2.5 px-3 py-2.5 ${isOn ? '' : 'opacity-70'}`}>
                <Checkbox id={`slide-${m.id}`} checked={isOn} onCheckedChange={() => toggle(m.id)} className="mt-0.5" />
                <label htmlFor={`slide-${m.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-gray-900">{isOn && <span className="mr-1 tabular-nums text-gray-400">{i + 1}.</span>}{m.label}</span>
                    <span className="text-[11px] text-gray-500">{m.when}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-gray-600">{m.shows}</span>
                </label>
                {isOn && (
                  <span className="flex flex-col">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label={`Move ${m.label} up`} disabled={i === 0} onClick={() => move(m.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label={`Move ${m.label} down`} disabled={i === value.slides.length - 1} onClick={() => move(m.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Slide labels</p>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label="Slide labels">
          {([['verdict', 'The good / the bad'], ['lifecycle', 'Use from week…']] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={value.kickers === k} onClick={() => onChange({ ...value, kickers: k })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium focus-brand ${value.kickers === k ? 'bg-white text-brand shadow-sm' : 'text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-gray-500">The first reads like Yano’s prospect scan. The second uses his client template tags.</p>
      </div>
    </div>
  );
}
