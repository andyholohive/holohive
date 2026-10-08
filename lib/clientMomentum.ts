/**
 * Momentum index — one 0–100 number for "which way is this client heading",
 * with a weekly history so a slide shows up before renewal does.
 *
 * Built only from inputs that have history, so every past week can be
 * recomputed from today's data (no snapshot table, no cron):
 *   - Reach momentum    reads, 4 complete weeks vs the 4 before   ±100% → 0/100
 *   - Delivery pace     posts, same windows                       ±100% → 0/100
 *   - Mindshare rank    rolling share rank within the peer set    #1 → 100, last → 0
 *   - Share momentum    log2 change of rolling share               ×4 down/up → 0/100
 * The score is the average of whichever parts exist that week; 50 is flat.
 * Pure: no I/O. Used by the dashboard, the portal preview and /attention.
 */

import type { ClientDashboardData } from '@/lib/clientDashboard';

export interface MomentumPoint { week: string; score: number }
export interface Momentum {
  score: number;
  /** Change vs 3 weeks earlier, in points. Null without that much history. */
  change3w: number | null;
  history: MomentumPoint[];
  parts: Array<{ key: string; label: string; score: number }>;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function computeMomentum(d: Pick<ClientDashboardData, 'weekly' | 'position'>): Momentum | null {
  const done = d.weekly.filter((w) => !w.partial);
  const wIdx = new Map(done.map((w, i) => [w.week, i]));
  const me = d.position?.projects.find((p) => p.isClient) ?? null;
  // Score the position weeks when we have them (they carry mindshare), else the delivery weeks.
  const weeks = d.position?.weeks ?? done.map((w) => w.week);

  const partsAt = (week: string, pi: number) => {
    const out: Array<{ key: string; label: string; score: number }> = [];
    const i = wIdx.get(week);
    if (i !== undefined && i >= 7) {
      const sum = (f: (w: typeof done[number]) => number, a: number, b: number) => done.slice(a, b).reduce((n, w) => n + f(w), 0);
      const r1 = sum((w) => w.reads, i - 3, i + 1), r0 = sum((w) => w.reads, i - 7, i - 3);
      if (r0 > 0) out.push({ key: 'reach', label: 'Reach momentum', score: clamp(50 + ((r1 - r0) / r0) * 50) });
      const p1 = sum((w) => w.posts, i - 3, i + 1), p0 = sum((w) => w.posts, i - 7, i - 3);
      if (p0 > 0) out.push({ key: 'pace', label: 'Delivery pace', score: clamp(50 + ((p1 - p0) / p0) * 50) });
    }
    if (me && d.position && pi >= 0) {
      const shares = d.position.projects.map((p) => p.share[pi]).filter((v): v is number => v !== null);
      const mine = me.share[pi];
      if (mine !== null && shares.length > 1) {
        const rank = shares.filter((v) => v > mine).length + 1;
        out.push({ key: 'rank', label: 'Mindshare rank', score: clamp(100 * (1 - (rank - 1) / (shares.length - 1))) });
      }
      const mo = me.momentum[pi];
      if (mo !== null) out.push({ key: 'share', label: 'Share momentum', score: clamp(50 + mo * 25) });
    }
    return out;
  };

  const history: MomentumPoint[] = [];
  let lastParts: ReturnType<typeof partsAt> = [];
  weeks.forEach((week, pi) => {
    const parts = partsAt(week, d.position ? pi : -1);
    if (parts.length >= 2) {
      history.push({ week, score: Math.round(parts.reduce((n, p) => n + p.score, 0) / parts.length) });
      lastParts = parts;
    }
  });
  if (!history.length) return null;
  const score = history[history.length - 1].score;
  const back = history.length >= 4 ? history[history.length - 4].score : null;
  return {
    score,
    change3w: back === null ? null : score - back,
    history,
    parts: lastParts.map((p) => ({ ...p, score: Math.round(p.score) })),
  };
}
