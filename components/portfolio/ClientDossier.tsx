'use client';

/**
 * One client, told along the campaign backbone.
 *
 * [2026-09-11, Andy] Every dossier walks the same five stages in the same
 * order, and each stage names the backbone link it covers — Term, Campaign,
 * Week/Angle/Slot, Post, then the relationship rails. A newcomer who has read
 * the backbone card at the top of the page can read any account here without
 * being told again what a lineup or an angle is.
 */

import { Card } from '@/components/ui/card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatRelativeShort } from '@/lib/dateFormat';
import type { ClientDossier as Dossier } from '@/lib/portfolioService';
import { strategyFor, type ClientStrategy, type Commitment } from '@/lib/portfolioStrategy';
import { useEffect } from 'react';
import { useRemembered } from '@/components/portfolio/Collapsible';
import { auditBackbone, groupByLink, BACKBONE_SEQUENCE, type BackboneFinding } from '@/lib/portfolioBackbone';
import {
  Users, Eye, FileText, MessageSquare, CalendarClock, Send, Monitor,
  Check, Circle, Dot, ExternalLink, BookOpen, AlertTriangle, ChevronRight, GitBranch,
} from 'lucide-react';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

const SENTIMENT: Array<{ key: string; label: string; tone: BadgeTone }> = [
  { key: 'positive', label: 'Positive', tone: 'success' },
  { key: 'hype', label: 'Hype', tone: 'brand' },
  { key: 'question', label: 'Questions', tone: 'info' },
  { key: 'negative', label: 'Negative', tone: 'warning' },
  { key: 'fud', label: 'FUD', tone: 'danger' },
  { key: 'noise', label: 'Noise', tone: 'neutral' },
];

/**
 * What the brief actually says, not just that one exists.
 *
 * The phases are transcribed from the client's own KOL Content Brief doc —
 * see `lib/portfolioStrategy.ts` for the read date and why this is manual.
 * The two things a newcomer needs off this block are the arc (what each phase
 * moves the audience from and to) and the rule (the line that becomes a
 * delivery obligation — a spend, a payment currency, a framing constraint).
 */
/**
 * What was promised, against what HHP has actually logged.
 *
 * [2026-09-11, Andy] The documents carry targets and the database carries
 * actuals, and nothing on the page put them side by side — so a client could sit
 * at 16% of its own stated target with both halves visible and neither one
 * pointing at the other.
 *
 * Commitments with no measurable counterpart still render. Dropping them would
 * leave only the countable half of each deal on the page, which reads as the
 * whole deal and flatters it.
 */
/**
 * How this account departs from the standard workflow.
 *
 * Design departures lead, gaps follow. That order is the argument: an account
 * that deliberately does not post is not a worse version of one that does, and
 * showing its chosen shape first stops the list below reading as a charge
 * sheet. Where an account matches the backbone, the block says so rather than
 * rendering nothing — silence would be indistinguishable from not having
 * checked.
 */
/** "1st of 5" — a position needs its field size to mean anything. */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function RankBadge({ place, of }: { place: number; of: number }) {
  if (!place || !of) return null;
  // Only the top place is worth colouring. Marking 4th of 5 in red would read
  // as a fault where the number itself is already the message.
  return (
    <StatusBadge tone={place === 1 ? 'success' : 'neutral'} size="sm">
      {ordinal(place)} of {of}
    </StatusBadge>
  );
}

function BackboneDelta({ findings }: { findings: BackboneFinding[] }) {
  const design = findings.filter(f => f.kind === 'design');
  const gaps = findings.filter(f => f.kind === 'gap');
  const byLink = groupByLink(findings);

  return (
    <div className="rounded-[10px] border border-cream-200 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-cream-50 border-b border-cream-200 flex items-center gap-2 flex-wrap">
        <GitBranch className="h-3.5 w-3.5 text-brand flex-shrink-0" />
        <span className="text-[11.5px] text-ink-warm-500">
          Read top to bottom — this is the workflow in order, with the differences in place.
        </span>
        <span className="flex items-center gap-2 ml-auto">
          {design.length > 0 && <StatusBadge tone="brand" size="sm">{design.length} by design</StatusBadge>}
          {gaps.length > 0 && (
            <StatusBadge tone="warning" size="sm">{gaps.length} gap{gaps.length === 1 ? '' : 's'}</StatusBadge>
          )}
          {findings.length === 0 && <StatusBadge tone="success" size="sm">standard throughout</StatusBadge>}
        </span>
      </div>

      {BACKBONE_SEQUENCE.map(group => (
        <div key={group.group}>
          <div className="px-3.5 py-1.5 bg-cream-50/60 border-y border-cream-100 flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
              {group.group}
            </span>
            <span className="text-[11px] text-ink-warm-400">{group.note}</span>
          </div>

          {group.links.map(link => {
            const hits = byLink.get(link) ?? [];

            // A link that held. One quiet line — the point is continuity, so
            // the eye can see how far the chain runs before it breaks.
            if (hits.length === 0) {
              return (
                <div
                  key={link}
                  className="px-3.5 py-1.5 border-b border-cream-100 last:border-b-0 flex items-center gap-2"
                >
                  <Check className="h-3 w-3 text-ink-warm-300 flex-shrink-0" aria-hidden="true" />
                  <span className="text-[12px] text-ink-warm-400">{link}</span>
                  <span className="text-[11px] text-ink-warm-300 ml-auto">as standard</span>
                </div>
              );
            }

            return hits.map((f, i) => (
              <div key={`${link}-${i}`} className="border-b border-cream-100 last:border-b-0">
                <div className="flex items-center gap-2 flex-wrap px-3.5 pt-2.5 pb-2">
                  <span
                    className={`w-[3px] h-3.5 rounded-sm flex-shrink-0 ${
                      f.kind === 'design' ? 'bg-brand' : 'bg-amber-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-[12.5px] font-semibold text-ink-warm-900">{f.link}</span>
                  <StatusBadge tone={f.kind === 'design' ? 'brand' : 'warning'} size="sm">
                    {f.kind === 'design' ? 'by design' : 'gap'}
                  </StatusBadge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-cream-100">
                  <div className="bg-white px-3.5 pb-2.5 pt-2 flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-warm-400">
                      Normally
                    </span>
                    <span className="text-[12px] text-ink-warm-400 leading-relaxed">{f.standard}</span>
                  </div>
                  <div
                    className={`px-3.5 pb-2.5 pt-2 flex flex-col gap-1 ${
                      f.kind === 'design' ? 'bg-brand-light/40' : 'bg-amber-50/60'
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">
                      Here
                    </span>
                    <span className="text-[12px] text-ink-warm-900 leading-relaxed">{f.actual}</span>
                  </div>
                </div>
              </div>
            ));
          })}
        </div>
      ))}
    </div>
  );
}

function Commitments({ items, actuals }: {
  items: Commitment[];
  actuals: { kols: number; posts: number; views: number };
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
        What we committed to, against what is logged
      </p>
      <div className="border border-cream-200 rounded-[10px] overflow-hidden">
        {items.map(c => {
          // HHP's own number where it has one, otherwise the figure the client's
          // report carries — labelled differently, because the second is a
          // reading we are repeating rather than one we can recompute.
          const actual = c.metric ? actuals[c.metric] : c.reportedActual ?? null;
          const fromReport = !c.metric && c.reportedActual !== undefined;
          const pct = c.target && actual !== null ? Math.round((actual / c.target) * 100) : null;
          const tone: BadgeTone =
            pct === null ? 'neutral' : pct >= 100 ? 'success' : pct >= 60 ? 'warning' : 'danger';
          return (
            <div key={c.label} className="px-3.5 py-3 border-b border-cream-100 last:border-b-0 flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-[12.5px] font-semibold text-ink-warm-900">{c.label}</span>
                {pct === null ? (
                  <StatusBadge tone="neutral" size="sm">tracked off-platform</StatusBadge>
                ) : (
                  <StatusBadge tone={tone} size="sm">{pct}% of target</StatusBadge>
                )}
              </span>
              <span className="flex items-baseline gap-2 flex-wrap text-[12px]">
                <span className="text-ink-warm-500">Agreed</span>
                <span className="font-semibold text-ink-warm-900">{c.committed}</span>
                {actual !== null && (
                  <>
                    <span className="text-ink-warm-300">·</span>
                    <span className="text-ink-warm-500">{fromReport ? 'Reported' : 'Logged'}</span>
                    <span className="font-semibold text-ink-warm-900 tabular-nums">
                      {c.metric === 'views' ? compact(actual) : actual}
                    </span>
                  </>
                )}
              </span>
              <span className="text-[11.5px] text-ink-warm-400 leading-snug max-w-[80ch]">{c.source}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StrategyBrief({ s }: { s: ClientStrategy }) {
  return (
    <div className="rounded-[10px] border border-cream-200 bg-cream-50/60 overflow-hidden">
      <div className="px-3.5 py-3 border-b border-cream-200 flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-brand flex-shrink-0" />
          <span className="text-[12.5px] font-semibold text-ink-warm-900">{s.docTitle}</span>
          {/* [2026-09-11, Andy] Age, not just a date. Everything in this block
              was transcribed by hand from documents that change without telling
              us, so the badge has to say when it is getting old rather than
              quietly presenting a stale reading as current. */}
          {(() => {
            const days = Math.floor((Date.now() - new Date(s.readOn).getTime()) / 86_400_000);
            const tone = days >= 90 ? 'danger' : days >= 30 ? 'warning' : 'neutral';
            return (
              <StatusBadge tone={tone} size="sm">
                {days <= 0 ? 'read today' : days === 1 ? 'read yesterday' : `read ${days}d ago`}
              </StatusBadge>
            );
          })()}
        </span>
        <p className="text-[12.5px] text-ink-warm-700 leading-relaxed max-w-[80ch]">{s.thesis}</p>
      </div>

      <div className="flex flex-col">
        {s.phases.map((p, i) => (
          <div key={p.name} className="px-3.5 py-3 border-b border-cream-100 last:border-b-0 flex flex-col gap-1.5">
            <span className="flex items-baseline gap-2 flex-wrap">
              <span className="text-brand font-semibold tabular-nums text-[11px]">{i + 1}</span>
              <span className="text-[12.5px] font-semibold text-ink-warm-900">{p.name}</span>
              <span className="text-[11px] text-ink-warm-400 tabular-nums">{p.window}</span>
              <span className="text-[11px] text-ink-warm-400">· {p.volume}</span>
            </span>

            <p className="text-[12px] text-ink-warm-700 leading-relaxed max-w-[80ch]">{p.arc}</p>

            {p.rule && (
              <p className="text-[12px] text-ink-warm-900 leading-relaxed max-w-[80ch] border-l-2 border-brand pl-2.5">
                <b className="font-semibold">Binding:</b> {p.rule}
              </p>
            )}

            {p.gap && (
              <p className="text-[11.5px] text-amber-800 leading-relaxed max-w-[80ch] flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
                <span>{p.gap}</span>
              </p>
            )}

            {p.briefs.length > 0 && (
              <ul className="flex flex-col gap-0.5 pt-0.5">
                {p.briefs.map(b => (
                  <li key={b} className="text-[11.5px] text-ink-warm-500 flex items-start gap-1.5">
                    <Dot className="h-3.5 w-3.5 flex-shrink-0 text-ink-warm-300" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Documents read alongside the brief. These carry the constraints that
          never reach the weekly plan but still govern what may ship.
          [2026-09-11, Andy] Collapsed by default. Fogo alone carries eight of
          these and, left open, one account ran to 3,700 words — past the point
          where anyone reads rather than scrolls. The summaries are the reference
          layer; the thesis and the stages above are the part you read straight
          through. */}
      {s.supporting && s.supporting.length > 0 && (
        <details className="group border-t border-cream-200 bg-white">
          <summary className="px-3.5 py-2.5 flex items-center gap-2 cursor-pointer list-none marker:hidden hover:bg-cream-50 transition-colors focus-brand">
            <ChevronRight className="h-3.5 w-3.5 text-ink-warm-400 flex-shrink-0 transition-transform group-open:rotate-90" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
              Read alongside the brief
            </span>
            <StatusBadge tone="neutral" size="sm">{s.supporting.length}</StatusBadge>
          </summary>
        <div className="flex flex-col border-t border-cream-100">
          {s.supporting.map(doc => (
            <div key={doc.title} className="px-3.5 py-3 flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-ink-warm-900">{doc.title}</span>
              <p className="text-[12px] text-ink-warm-700 leading-relaxed max-w-[80ch]">{doc.summary}</p>
              {doc.rules && doc.rules.length > 0 && (
                <ul className="flex flex-col gap-1.5 pt-0.5">
                  {doc.rules.map(r => (
                    <li key={r} className="text-[12px] text-ink-warm-900 leading-relaxed max-w-[80ch] border-l-2 border-brand pl-2.5">
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        </details>
      )}
    </div>
  );
}

function Initials({ name, src }: { name: string; src: string | null }) {
  const initials = (name || '?').split(' ').map(w => w.charAt(0).toUpperCase()).join('').slice(0, 2);
  if (src) {
    return (
      <div className="h-11 w-11 rounded-[10px] overflow-hidden flex-shrink-0 ring-1 ring-cream-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className="h-11 w-11 rounded-[10px] bg-brand-light text-brand flex items-center justify-center font-bold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

/**
 * A numbered stage of the backbone. The number is not decoration — the stages
 * are a genuine sequence and always appear in this order on every client.
 */
/**
 * One numbered stage of the backbone, collapsible and remembered.
 *
 * The stage id carries the client so collapsing "What actually shipped" on one
 * account does not collapse it on the next — the reason you close a stage is
 * usually specific to the account you are reading.
 */
function Stage({
  id, n, title, backbone, hint, children,
}: {
  id: string; n: string; title: string; backbone: string; hint?: string; children: React.ReactNode;
}) {
  const { open, onToggle } = useRemembered(id, true);
  return (
    <details open={open} onToggle={onToggle} className="group/stage flex flex-col">
      <summary className="flex items-baseline gap-2.5 flex-wrap pb-1.5 border-b border-cream-100 cursor-pointer list-none marker:hidden rounded focus-brand hover:bg-cream-50/60 transition-colors">
        <ChevronRight
          className="h-3.5 w-3.5 text-ink-warm-300 flex-shrink-0 self-center transition-transform group-open/stage:rotate-90"
          aria-hidden="true"
        />
        <span className="text-[11px] font-semibold text-brand tabular-nums tracking-[0.1em]">{n}</span>
        <h4 className="text-[13.5px] font-semibold text-ink-warm-900 tracking-tight">{title}</h4>
        <StatusBadge tone="neutral" size="sm">{backbone}</StatusBadge>
        {hint && <span className="text-[11px] text-ink-warm-400 ml-auto">{hint}</span>}
      </summary>
      <div className="flex flex-col gap-2.5 pt-2.5">{children}</div>
    </details>
  );
}

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 bg-white">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">
        <Icon className="h-3 w-3" />{label}
      </span>
      <span className="text-lg font-semibold text-ink-warm-900 tabular-nums leading-tight">{value}</span>
    </div>
  );
}

/** The bulleted takeaways from a sync summary, minus the header line. */
function callNoteExcerpt(content: string): string[] {
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-') || l.startsWith('•'))
    .slice(0, 3)
    .map(l => l.replace(/^[-•]\s*/, ''));
}

export function ClientDossier({ d, focus }: { d: Dossier; focus?: { id: string; n: number } | null }) {
  const endingSoon = d.daysLeft !== null && d.daysLeft <= 21;
  const spentPct = d.invoiced > 0 ? Math.round((d.toCreators / d.invoiced) * 100) : 0;
  const sentimentTotal = Object.values(d.sentiment).reduce((s, n) => s + n, 0);
  const cleanScope = d.scope ? d.scope.replace(/https?:\/\/\S+/g, '').trim() : '';
  const strategy = strategyFor(d.name);
  const { open: cardOpen, onToggle: onCardToggle, set: setCardOpen } = useRemembered(`${d.id}-card`, true);
  const findings = auditBackbone(d, strategy);

  // Jumping to an account opens it. Landing on a collapsed card after clicking
  // the client's own name reads as the link having failed. `focus` carries a
  // counter as well as an id so clicking the same name twice still fires.
  useEffect(() => {
    if (focus && focus.id === d.id) setCardOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, focus?.n, d.id]);

  return (
    <Card id={`client-${d.id}`} className="border-cream-200 overflow-hidden scroll-mt-28">

      {/* ── identity ─────────────────────────────────────────────── */}
      {/* The whole account collapses from its own header, so the page can be
          narrowed to the one client you came for. The identity row stays
          visible when closed — a collapsed account still has to be findable
          and still has to show whether it needs attention, which is why the
          status and term badges live in the summary rather than inside. */}
      <details open={cardOpen} onToggle={onCardToggle} className="group/client">
      <summary className="flex items-start gap-3.5 flex-wrap px-5 py-4 bg-cream-50 border-b border-cream-200 cursor-pointer list-none marker:hidden hover:bg-cream-100/60 transition-colors focus-brand">
        <ChevronRight
          className="h-4 w-4 text-ink-warm-400 flex-shrink-0 self-center transition-transform group-open/client:rotate-90"
          aria-hidden="true"
        />
        <Initials name={d.name} src={d.logoUrl} />
        <div className="flex-1 min-w-[240px] flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-lg font-semibold text-ink-warm-900 tracking-tight">{d.name}</h3>
            {d.campaignStatus && (
              <StatusBadge tone={d.campaignStatus === 'Active' ? 'brand' : 'neutral'} size="sm">
                {d.campaignStatus}
              </StatusBadge>
            )}
            {d.weekNumber !== null && <StatusBadge tone="neutral" size="sm">Week {d.weekNumber}</StatusBadge>}
            {endingSoon && (
              <StatusBadge tone={d.daysLeft !== null && d.daysLeft <= 0 ? 'danger' : 'warning'} size="sm">
                {d.daysLeft !== null && d.daysLeft <= 0 ? 'Term ended' : `${d.daysLeft} days left`}
              </StatusBadge>
            )}
          </div>
          <p className="text-[13px] text-ink-warm-700 leading-relaxed max-w-[74ch]">
            {cleanScope
              ? `${cleanScope.slice(0, 240)}${cleanScope.length > 240 ? '…' : ''}`
              : <span className="text-ink-warm-400 italic">No scope recorded for this client.</span>}
          </p>
        </div>
      </summary>

      <div className="p-5 flex flex-col gap-7">

        {/* ── 00 · how this account differs ────────────────────── */}
        <Stage id={`${d.id}-stage-00`} n="00" title="Where this account departs from the backbone"
               backbone="Workflow"
               hint={findings.length === 0 ? 'standard shape' : `${findings.length} difference${findings.length === 1 ? '' : 's'}`}>
          <BackboneDelta findings={findings} />
        </Stage>

        {/* ── 01 · the agreement ───────────────────────────────── */}
        <Stage id={`${d.id}-stage-01`} n="01" title="The agreement" backbone="Term"
               hint={`${d.terms} term${d.terms === 1 ? '' : 's'} · ${d.team || 'unassigned'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-cream-200 border border-cream-200 rounded-[10px] overflow-hidden">
            <div className="bg-white px-4 py-3 flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">Runs</span>
              <span className="text-[13px] text-ink-warm-900 tabular-nums">
                {d.stintStart ? formatDate(d.stintStart) : '—'} → {d.stintEnd ? formatDate(d.stintEnd) : 'open'}
              </span>
              <span className="text-[11px] text-ink-warm-400">
                {d.daysLeft === null ? 'no end date set'
                  : d.daysLeft <= 0 ? 'term has ended'
                  : `${d.daysLeft} days remaining`}
              </span>
            </div>
            <div className="bg-white px-4 py-3 flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">Invoiced</span>
              <span className="text-[17px] font-semibold text-ink-warm-900 tabular-nums leading-tight">{money(d.invoiced)}</span>
              <span className="text-[11px] text-ink-warm-400">budget + fee billed</span>
            </div>
            <div className="bg-white px-4 py-3 flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">Engaged</span>
              <span className="text-[17px] font-semibold text-ink-warm-900 tabular-nums leading-tight">
                {d.monthsEngaged} mo
              </span>
              <span className="text-[11px] text-ink-warm-400">since first term began</span>
            </div>
          </div>

          <div className="flex h-7 rounded-md overflow-hidden border border-cream-200">
            <div className="bg-brand flex items-center justify-center text-[11px] font-semibold text-white tabular-nums"
                 style={{ flex: Math.max(d.toCreators, 1) }}>
              {d.toCreators > 0 ? money(d.toCreators) : ''}
            </div>
            {d.owed > 0 && <div className="bg-amber-500" style={{ flex: d.owed }} />}
            <div className="bg-cream-200 flex items-center justify-center text-[11px] font-semibold text-ink-warm-500 tabular-nums"
                 style={{ flex: Math.max(d.unspent, 1) }}>
              {d.unspent > 0 ? money(d.unspent) : ''}
            </div>
          </div>
          <div className="flex gap-4 flex-wrap text-[11.5px] text-ink-warm-500">
            <span><span className="inline-block h-2 w-2 rounded-sm bg-brand mr-1.5" />{money(d.toCreators)} paid to creators ({spentPct}%)</span>
            {d.owed > 0 && (
              <span className="text-amber-700">
                <span className="inline-block h-2 w-2 rounded-sm bg-amber-500 mr-1.5" />
                {money(d.owed)} owed · {d.owedRows} post{d.owedRows === 1 ? '' : 's'}
              </span>
            )}
            <span><span className="inline-block h-2 w-2 rounded-sm bg-cream-300 mr-1.5" />{money(d.unspent)} unspent, refundable</span>
          </div>

          {strategy?.commitments && strategy.commitments.length > 0 && (
            <Commitments
              items={strategy.commitments}
              actuals={{ kols: d.kols, posts: d.posts, views: d.views }}
            />
          )}
        </Stage>

        {/* ── 02 · onboarding ladder ──────────────────────────── */}
        {d.milestones.length > 0 && (
          <Stage id={`${d.id}-stage-02`} n="02" title="How far along the onboarding path" backbone="Milestones"
                 hint="The same seven steps for every client">
            <ol className="flex flex-col gap-0 border border-cream-200 rounded-[10px] overflow-hidden">
              {d.milestones.map((m, i) => {
                const done = m.status === 'complete';
                const active = m.status === 'active';
                return (
                  <li key={i} className={`flex items-start gap-3 px-3.5 py-2.5 border-b border-cream-100 last:border-b-0 ${active ? 'bg-brand-light/40' : ''}`}>
                    <span className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                      done ? 'bg-brand text-white' : active ? 'bg-white ring-2 ring-brand' : 'bg-cream-100'
                    }`}>
                      {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        : active ? <Dot className="h-3 w-3 text-brand" />
                        : <Circle className="h-2 w-2 text-ink-warm-300" />}
                    </span>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className={`text-[12.5px] leading-snug ${done ? 'text-ink-warm-500' : 'font-semibold text-ink-warm-900'}`}>
                        {m.name}
                      </span>
                      {m.subtitle && (
                        <span className="text-[11px] text-ink-warm-400 leading-snug">{m.subtitle}</span>
                      )}
                    </span>
                    {active && (
                      <StatusBadge tone="brand" size="sm" >In progress</StatusBadge>
                    )}
                  </li>
                );
              })}
            </ol>
          </Stage>
        )}

        {/* ── 03 · strategy library ───────────────────────────── */}
        {(d.links.length > 0 || strategy) && (
          <Stage id={`${d.id}-stage-03`} n="03" title="The strategy of record" backbone="Briefs & plans"
                 hint={`${d.linkCount} document${d.linkCount === 1 ? '' : 's'} filed`}>
            <p className="text-[12px] text-ink-warm-500 leading-relaxed -mt-0.5">
              The GTM plan, outreach brief and content brief are where the weekly angles come from.
              The content brief is read out in full below; everything else is filed against this
              client in Links.
            </p>

            {strategy && <StrategyBrief s={strategy} />}

            {d.links.length > 0 && (
            <div className="border border-cream-200 rounded-[10px] overflow-hidden">
              {d.links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 px-3.5 py-2.5 border-b border-cream-100 last:border-b-0 hover:bg-cream-50 transition-colors focus-brand"
                >
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-[13px] text-ink-warm-900 leading-snug flex items-center gap-1.5">
                      {l.name}
                      <ExternalLink className="h-3 w-3 text-ink-warm-300 flex-shrink-0" />
                    </span>
                    {l.types.length > 0 && (
                      <span className="flex gap-1 flex-wrap">
                        {l.types.slice(0, 3).map(t => (
                          <StatusBadge key={t} tone={t === 'client delivery' ? 'brand' : 'neutral'} size="sm">{t}</StatusBadge>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-ink-warm-400 tabular-nums whitespace-nowrap">
                    {l.createdAt ? formatDate(l.createdAt) : ''}
                  </span>
                </a>
              ))}
            </div>
            )}
            {d.linkCount > d.links.length && (
              <p className="text-[11px] text-ink-warm-400">
                Showing {d.links.length} of {d.linkCount}. The rest are on the Links page.
              </p>
            )}
          </Stage>
        )}

        {/* ── 04 · the plan ────────────────────────────────────── */}
        <Stage id={`${d.id}-stage-04`} n="04" title="The plan, week by week" backbone="Week → Angle → Slot"
               hint="Lead time = days the plan went up before the week began">
          {d.weeks.length === 0 ? (
            <p className="text-[13px] text-ink-warm-400 italic">No weekly plan has been built for this client yet.</p>
          ) : (
            <>
              <div className="border border-cream-200 rounded-[10px] overflow-hidden overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-cream-50 hover:bg-cream-50">
                      <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Week</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Angles &amp; who took them</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Brief cycle</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Delivered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.weeks.map(w => (
                      <TableRow key={`${w.weekNumber}-${w.weekOf}`} className="border-cream-100 align-top">
                        <TableCell className="py-3 whitespace-nowrap">
                          <span className="font-medium text-ink-warm-900">Wk {w.weekNumber}</span>
                          <span className="block text-[11px] text-ink-warm-400 tabular-nums">{formatDate(w.weekOf)}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-2 min-w-[240px]">
                            {w.angles.length === 0 && <span className="text-[12px] text-ink-warm-400 italic">No angles set</span>}
                            {w.angles.map((a, i) => (
                              <div key={i} className="flex flex-col gap-0.5">
                                <span className="text-[12.5px] font-medium text-ink-warm-900 leading-snug">{a.name}</span>
                                <span className="text-[11px] text-ink-warm-500 leading-snug">
                                  {a.creators.join(' · ') || 'no creators assigned'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 whitespace-nowrap">
                          {w.proposedAt ? (
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-[12px] tabular-nums ${w.leadDays !== null && w.leadDays < 0 ? 'text-rose-600 font-medium' : 'text-ink-warm-700'}`}>
                                {w.leadDays !== null
                                  ? w.leadDays >= 0 ? `${w.leadDays}d before` : `${Math.abs(w.leadDays)}d late`
                                  : '—'}
                              </span>
                              <span className="text-[11px] text-ink-warm-400 tabular-nums">
                                {w.reviewHours !== null
                                  ? w.reviewHours < 0.2 ? 'signed off instantly' : `${w.reviewHours}h to sign off`
                                  : 'not signed off'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[12px] text-ink-warm-300">not proposed</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 whitespace-nowrap">
                          <span className="flex items-center gap-1 mb-1">
                            {Array.from({ length: w.posted }).map((_, i) => <i key={`p${i}`} className="h-3 w-3 rounded-[3px] bg-brand inline-block" />)}
                            {Array.from({ length: w.missed }).map((_, i) => <i key={`m${i}`} className="h-3 w-3 rounded-[3px] bg-rose-300 inline-block" />)}
                            {Array.from({ length: w.pending }).map((_, i) => <i key={`w${i}`} className="h-3 w-3 rounded-[3px] bg-cream-300 inline-block" />)}
                          </span>
                          <span className="text-[11px] text-ink-warm-500 tabular-nums">{w.posted} of {w.slots} slots</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] text-ink-warm-400">
                Teal = creator posted · pink = slot missed · grey = still open this week.
              </p>
            </>
          )}
        </Stage>

        {/* ── 03 · what shipped ───────────────────────────────── */}
        <Stage id={`${d.id}-stage-05`} n="05" title="What actually shipped" backbone="Post">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-cream-200 border border-cream-200 rounded-[10px] overflow-hidden">
            <Stat icon={Users} label="Creators" value={`${d.kols}`} />
            <Stat icon={Send} label="Posts live" value={`${d.posts}`} />
            <Stat icon={Eye} label="Views" value={compact(d.views)} />
            <Stat icon={MessageSquare} label="Engagements" value={compact(d.engagements)} />
          </div>

          {d.topPosts.length > 0 && d.topPosts[0].views > 0 && (
            <div className="border border-cream-200 rounded-[10px] overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-cream-50 hover:bg-cream-50">
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Best posts</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Format</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Views</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Engagements</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.topPosts.map((p, i) => (
                    <TableRow key={i} className="border-cream-100">
                      <TableCell className="py-3 font-medium text-ink-warm-900">{p.kol}</TableCell>
                      <TableCell className="py-3 text-ink-warm-500">{p.type}</TableCell>
                      <TableCell className="py-3 tabular-nums">{p.views.toLocaleString('en-US')}</TableCell>
                      <TableCell className="py-3 tabular-nums">{p.engagements.toLocaleString('en-US')}</TableCell>
                      <TableCell className="py-3 tabular-nums text-ink-warm-500">{p.date ? formatDate(p.date) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {sentimentTotal > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-warm-500">
                What the Korean audience said back — {sentimentTotal} scored comments
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {SENTIMENT.filter(s => d.sentiment[s.key]).map(s => (
                  <StatusBadge key={s.key} tone={s.tone} size="sm">{s.label} {d.sentiment[s.key]}</StatusBadge>
                ))}
              </div>
            </div>
          )}
        </Stage>

        {/* ── 04 · the relationship ───────────────────────────── */}
        <Stage id={`${d.id}-stage-06`} n="06" title="How the client sees it" backbone="Report · Portal · Chat"
               hint={d.portalExternalVisits === 0 ? 'never opened the portal' : undefined}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">Delivered to them</span>
              {d.docs.length === 0 ? (
                <p className="text-[13px] text-ink-warm-400 italic">Nothing delivered yet.</p>
              ) : (
                <div className="border border-cream-200 rounded-[10px] overflow-hidden">
                  {d.docs.map((doc, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 border-b border-cream-100 last:border-b-0">
                      <span className="text-[13px] text-ink-warm-900 leading-snug">{doc.title}</span>
                      <span className="text-[11px] text-ink-warm-400 tabular-nums whitespace-nowrap">
                        {formatDate(doc.createdAt)}{doc.opens > 0 ? ` · ${doc.opens} opens` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">
                  Are they reading it
                </span>
                <StatusBadge tone="neutral" size="sm">client only</StatusBadge>
              </span>
              <div className="grid grid-cols-3 gap-px bg-cream-200 border border-cream-200 rounded-[10px] overflow-hidden">
                <div className="bg-white px-3 py-2.5 flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-ink-warm-900">
                    <FileText className="h-3.5 w-3.5 text-ink-warm-400" />{d.docMinutes}m
                  </span>
                  <span className="text-[11px] text-ink-warm-500">in documents</span>
                  <RankBadge place={d.rank.clientReadingMinutes} of={d.rank.of} />
                </div>
                <div className="bg-white px-3 py-2.5 flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-ink-warm-900">
                    <Users className="h-3.5 w-3.5 text-ink-warm-400" />{d.docReaders}
                  </span>
                  <span className="text-[11px] text-ink-warm-500">people reading</span>
                </div>
                <div className="bg-white px-3 py-2.5 flex flex-col gap-1">
                  <span className={`flex items-center gap-1.5 text-lg font-semibold tabular-nums ${d.portalExternalVisits === 0 ? 'text-rose-600' : 'text-ink-warm-900'}`}>
                    <Monitor className="h-3.5 w-3.5 text-ink-warm-400" />{d.portalExternalVisits}
                  </span>
                  <span className="text-[11px] text-ink-warm-500">portal visits</span>
                  <RankBadge place={d.rank.portalVisits} of={d.rank.of} />
                </div>
              </div>

              {/* What was taken out, so the headline number is auditable rather
                  than just smaller than it used to be. */}
              {(d.docInternalOpens > 0 || d.docUnattributedOpens > 0) && (
                <p className="text-[11px] text-ink-warm-400 leading-relaxed">
                  Excludes {d.docInternalOpens} open{d.docInternalOpens === 1 ? '' : 's'} by our own team
                  {d.docUnattributedOpens > 0 && (
                    <> and {d.docUnattributedOpens} with no viewer recorded</>
                  )}. Only reads by the client are counted here.
                </p>
              )}

              <p className="text-[11px] text-ink-warm-400">
                {d.deliveryEntries} work item{d.deliveryEntries === 1 ? '' : 's'} logged against this client
                {d.deliveryLast14 > 0 ? ` · ${d.deliveryLast14} in the last 14 days` : ' · none in the last 14 days'}
              </p>

              {d.latestCallNote && (
                <div className="rounded-[10px] border border-cream-200 bg-cream-50 px-3.5 py-3 flex flex-col gap-2 mt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">
                    Last call{d.latestCallNote.date ? ` · ${formatDate(d.latestCallNote.date)}` : ''} · {d.callNoteCount} logged
                  </span>
                  {callNoteExcerpt(d.latestCallNote.content).map((line, i) => (
                    <p key={i} className="text-[12.5px] text-ink-warm-700 leading-relaxed flex gap-2">
                      <CalendarClock className="h-3.5 w-3.5 text-brand flex-shrink-0 mt-0.5" />
                      <span>{line}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {d.messages.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-warm-500">
                Latest in the shared channel
              </span>
              <div className="flex flex-col gap-2.5">
                {d.messages.map((m, i) => (
                  <div key={i} className={`pl-3 border-l-2 ${m.isClient ? 'border-brand' : 'border-cream-300'} flex flex-col gap-0.5`}>
                    <span className="text-[12px] font-semibold text-ink-warm-900 flex items-baseline gap-2 flex-wrap">
                      {m.who}
                      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-warm-400 font-normal">
                        {m.isClient ? 'client' : 'Holo Hive'}
                      </span>
                      <span className="text-[10.5px] text-ink-warm-400 font-normal tabular-nums">
                        {formatRelativeShort(m.at)}
                      </span>
                    </span>
                    <span className="text-[13px] text-ink-warm-700 leading-relaxed">
                      {m.text.replace(/\s+/g, ' ').slice(0, 240)}{m.text.length > 240 ? '…' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Stage>

      </div>
      </details>
    </Card>
  );
}
