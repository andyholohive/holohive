'use client';

/**
 * Activation Results — the canonical render for a campaign's activation
 * snapshots. Lifted verbatim from the public campaign tracker so the
 * internal campaign admin page (Activations tab) shows the client exactly
 * what the client sees. Single source of truth: edit here, both surfaces
 * update.
 *
 * Each sub-block renders only when its own data blob is present — a simple
 * PFP activation shows 3-4 blocks; a Trader-Card style shows all 8.
 *
 * Props:
 *  - activations: the snapshot rows (Bolt wraps array payloads in an object
 *    envelope — `{series}`, `{kols}` — which we normalize here).
 *  - kols: optional id→name map so an entry that carries `kol_id` resolves to
 *    the roster name; entries usually carry only Bolt's `handle`.
 *  - maskHandles: showcase masking. The public page passes its showcase flag;
 *    the internal admin view always shows real names (default false).
 */

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell,
} from 'recharts';
import { ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

export type ActivationSnapshotView = {
  id: string;
  activation_name: string | null;
  activation_type: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  summary_json: any;
  entries_daily_json: any;
  entries_by_kol_json: any;
  clicks_json: any;
  ugc_json: any;
};

type KolLite = { id: string; name: string };

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'Active':
      return 'bg-emerald-100 text-emerald-800';
    case 'Planning':
      return 'bg-blue-100 text-blue-800';
    case 'Paused':
      return 'bg-yellow-100 text-yellow-800';
    case 'Completed':
      return 'bg-cream-100 text-ink-warm-800';
    default:
      return 'bg-cream-100 text-ink-warm-800';
  }
};

const ACRONYMS: Record<string, string> = {
  pfp: 'PFP', ugc: 'UGC', nft: 'NFT', dapp: 'dApp', dex: 'DEX',
  kol: 'KOL', defi: 'DeFi', ai: 'AI', p2e: 'P2E', tg: 'TG',
};
const prettify = (raw: string | null | undefined): string => {
  if (!raw) return '';
  return String(raw)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => ACRONYMS[w.toLowerCase()] ?? (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
};

const formatNum = (n: number | null | undefined): string => {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
};

// Donut palette — recycle through 8 colors so a 20-KOL chart still reads.
const PIE = ['#3e8692', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9', '#ef4444', '#64748b'];

export default function ActivationResultsSection({
  activations,
  kols = [],
  maskHandles = false,
}: {
  activations: ActivationSnapshotView[];
  kols?: KolLite[];
  maskHandles?: boolean;
}) {
  if (!activations || activations.length === 0) return null;

  const maskedKolName = (name: string, idx: number): string =>
    maskHandles ? `KOL #${idx + 1}` : name;

  return (
    <>
      {activations.map((activation) => (
        <div key={activation.id} className="mb-8 last:mb-0">{(() => {
          const s = activation.summary_json;
          // Bolt wraps the array payloads in an object envelope
          // (`{ series: [...] }`, `{ kols: [...] }`); older manual
          // snapshots stored a bare array. Normalize both shapes so
          // the chart/reduce code always sees a plain array.
          const dailyRaw: any = activation.entries_daily_json;
          const daily: any[] | null = Array.isArray(dailyRaw) ? dailyRaw : (dailyRaw?.series ?? null);
          const byKolRaw: any = activation.entries_by_kol_json;
          const byKol: any[] | null = Array.isArray(byKolRaw) ? byKolRaw : (byKolRaw?.kols ?? null);
          const clicks = activation.clicks_json;
          const ugc = activation.ugc_json;

          // Build per-KOL labels with showcase masking applied. Look up the
          // campaign_kol by kol_id when the snapshot provides it; fall back
          // to the activation API's `handle`, then a legacy `label`.
          const labelForKol = (entry: { kol_id?: string; label?: string; handle?: string }, idx: number): string => {
            if (entry.kol_id) {
              const match = kols.find(k => k.id === entry.kol_id);
              if (match) return maskedKolName(match.name, idx);
            }
            return maskHandles ? `KOL #${idx + 1}` : (entry.handle || entry.label || `KOL #${idx + 1}`);
          };

          const totalEntries = byKol ? byKol.reduce((sum, e) => sum + (e.entries || 0), 0) : 0;
          const sortedByKol = byKol
            ? [...byKol].sort((a, b) => (b.entries || 0) - (a.entries || 0))
            : [];

          return (
            <div className="mb-6 border border-brand/20 rounded-xl overflow-hidden bg-gradient-to-br from-brand/[0.03] to-transparent">
              {/* ─── Activation Hero ───────────────────── */}
              <div className="p-6 border-b border-brand/15 bg-white">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-brand mb-1">Activation Results</p>
                    <h3 className="text-2xl font-bold text-ink-warm-900">
                      {activation.activation_name || 'Live Activation'}
                    </h3>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-ink-warm-700 flex-wrap">
                      {activation.activation_type && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand">
                          {prettify(activation.activation_type)}
                        </span>
                      )}
                      {activation.start_date && activation.end_date && (
                        <span>
                          {formatDate(activation.start_date)} – {formatDate(activation.end_date)}
                        </span>
                      )}
                      {s?.target_market && (
                        <span className="text-ink-warm-500">· {s.target_market}</span>
                      )}
                    </div>
                  </div>
                  {activation.status && (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(activation.status)}`}>
                      {/* Title-case the lowercase DB status ("active",
                          "completed", "in_progress") so the badge reads cleanly. */}
                      {activation.status
                        .replace(/[_-]/g, ' ')
                        .split(' ')
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* ─── KPI cards — each renders only if its key exists. ─── */}
                {s && (() => {
                  const cards = [
                    { key: 'total_entries',     label: 'Total Entries',       value: s.total_entries },
                    { key: 'unique_participants', label: 'Unique Participants', value: s.unique_participants },
                    { key: 'kols_activated',    label: 'KOLs Activated',      value: s.kols_activated },
                    { key: 'wallets_registered',label: 'Wallets Registered',  value: s.wallets_registered },
                    { key: 'cards_minted',      label: 'Cards Minted',        value: s.cards_minted },
                    { key: 'frames_created',    label: 'Frames Created',      value: s.frames_created },
                  ].filter(c => typeof c.value === 'number');

                  if (cards.length === 0) return null;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {cards.map(c => (
                        <div key={c.key} className="bg-white border border-cream-200 rounded-lg p-3">
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500 mb-1">{c.label}</p>
                          <p className="text-2xl font-bold text-ink-warm-900 tabular-nums">{formatNum(c.value)}</p>
                          {s.context_sublabels?.[c.key] && (
                            <p className="text-[10px] text-ink-warm-500 mt-0.5">{s.context_sublabels[c.key]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* ─── Daily entries chart ──────────── */}
                  {daily && daily.length > 0 && (
                    <div className="bg-white border border-cream-200 rounded-lg p-4">
                      <p className="text-sm font-semibold text-ink-warm-900 mb-3">Daily Entries</p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                              formatter={(value: number) => [value.toLocaleString(), 'Entries']}
                            />
                            <Bar dataKey="entries" fill="#3e8692" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* ─── Entries by KOL channel donut ── */}
                  {byKol && byKol.length > 0 && (
                    <div className="bg-white border border-cream-200 rounded-lg p-4">
                      <p className="text-sm font-semibold text-ink-warm-900 mb-3">Entries by KOL Channel</p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={sortedByKol.map((e, idx) => ({
                                name: labelForKol(e, idx),
                                value: e.entries,
                              }))}
                              dataKey="value"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                            >
                              {sortedByKol.map((_, idx) => (
                                <Cell key={idx} fill={PIE[idx % PIE.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                              formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── KOL performance breakdown ──────── */}
                {byKol && byKol.length > 0 && (
                  <div className="bg-white border border-cream-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-cream-100 bg-cream-50/60">
                      <p className="text-sm font-semibold text-ink-warm-900">KOL Performance</p>
                      <p className="text-[11px] text-ink-warm-500 mt-0.5">Ranked by entries · share-of-pie shown below name.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-cream-50 text-[10px] uppercase tracking-wider text-ink-warm-500">
                          <tr>
                            <th className="text-left py-2 px-4 w-12">#</th>
                            <th className="text-left py-2 px-4">KOL</th>
                            <th className="text-right py-2 px-4 w-24">Entries</th>
                            <th className="text-left py-2 px-4 w-[30%]">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedByKol.map((e, idx) => {
                            const sharePct = totalEntries > 0 ? (e.entries / totalEntries) * 100 : 0;
                            return (
                              <tr key={`${e.kol_id || e.label || idx}`} className="border-t border-cream-100">
                                <td className="py-2 px-4 text-ink-warm-500 tabular-nums">{idx + 1}</td>
                                <td className="py-2 px-4 font-medium text-ink-warm-900 truncate">{labelForKol(e, idx)}</td>
                                <td className="py-2 px-4 text-right tabular-nums text-ink-warm-900 font-medium">{formatNum(e.entries)}</td>
                                <td className="py-2 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full bg-cream-100 overflow-hidden">
                                      <div className="h-full bg-brand" style={{ width: `${Math.max(2, Math.min(100, sharePct))}%` }} />
                                    </div>
                                    <span className="text-[11px] text-ink-warm-500 tabular-nums w-12 text-right">{sharePct.toFixed(1)}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* ─── Ecosystem engagement ─────────── */}
                  {!!(clicks && (clicks.by_protocol?.length || clicks.by_source?.length || clicks.total_referrals)) && (
                    <div className="bg-white border border-cream-200 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-ink-warm-900">Ecosystem Engagement</p>
                      {typeof clicks.total_referrals === 'number' && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-bold text-ink-warm-900 tabular-nums">{formatNum(clicks.total_referrals)}</span>
                          <span className="text-xs text-ink-warm-500">total referrals</span>
                        </div>
                      )}
                      {clicks.by_protocol && clicks.by_protocol.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500 mb-1.5">dApp clicks by protocol</p>
                          <ul className="space-y-1.5">
                            {clicks.by_protocol.map((p: any, idx: number) => (
                              <li key={p.protocol + idx} className="flex items-center justify-between text-xs">
                                <span className="text-ink-warm-700">{prettify(p.protocol)}</span>
                                <span className="font-medium text-ink-warm-900 tabular-nums">{formatNum(p.clicks)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {clicks.by_source && clicks.by_source.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500 mb-1.5">By source</p>
                          <ul className="space-y-1.5">
                            {clicks.by_source.map((p: any, idx: number) => (
                              <li key={p.source + idx} className="flex items-center justify-between text-xs">
                                <span className="text-ink-warm-700">{prettify(p.source)}</span>
                                <span className="font-medium text-ink-warm-900 tabular-nums">{formatNum(p.clicks)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── Points and prizes ────────────── */}
                  {s && (s.prize_pool || s.draw_structure || s.points_by_source) && (
                    <div className="bg-white border border-cream-200 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-ink-warm-900">Points & Prizes</p>
                      {s.prize_pool && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Prize pool</p>
                          <p className="text-xl font-bold text-ink-warm-900 tabular-nums">{s.prize_pool}</p>
                        </div>
                      )}
                      {s.draw_structure && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500 mb-0.5">Draw structure</p>
                          <p className="text-xs text-ink-warm-700">{s.draw_structure}</p>
                        </div>
                      )}
                      {s.points_by_source && s.points_by_source.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500 mb-1.5">Points by source</p>
                          <ul className="space-y-1.5">
                            {s.points_by_source.map((p: any, idx: number) => (
                              <li key={p.source + idx} className="flex items-center justify-between text-xs">
                                <span className="text-ink-warm-700">{prettify(p.source)}</span>
                                <span className="font-medium text-ink-warm-900 tabular-nums">{formatNum(p.points)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ─── UGC performance ──────────────── */}
                {ugc && (ugc.posts_approved || ugc.creators || ugc.views || ugc.top_post) && (
                  <div className="bg-white border border-cream-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-ink-warm-900 mb-3">UGC Performance</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      {typeof ugc.posts_approved === 'number' && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Posts Approved</p>
                          <p className="text-lg font-bold text-ink-warm-900 tabular-nums">{formatNum(ugc.posts_approved)}</p>
                        </div>
                      )}
                      {typeof ugc.creators === 'number' && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Creators</p>
                          <p className="text-lg font-bold text-ink-warm-900 tabular-nums">{formatNum(ugc.creators)}</p>
                        </div>
                      )}
                      {typeof ugc.approval_rate === 'number' && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Approval Rate</p>
                          <p className="text-lg font-bold text-ink-warm-900 tabular-nums">{(ugc.approval_rate * 100).toFixed(1)}%</p>
                        </div>
                      )}
                      {typeof ugc.views === 'number' && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Views</p>
                          <p className="text-lg font-bold text-ink-warm-900 tabular-nums">{formatNum(ugc.views)}</p>
                        </div>
                      )}
                    </div>
                    {ugc.top_post && (
                      <div className="border-t border-cream-100 pt-3">
                        <p className="text-[10px] uppercase tracking-wider text-ink-warm-500 mb-1.5">Top Post</p>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink-warm-900">
                              {maskHandles ? 'Top creator' : (ugc.top_post.creator_label || 'Creator')}
                            </p>
                            {ugc.top_post.snippet && (
                              <p className="text-xs text-ink-warm-700 italic mt-0.5 line-clamp-3">"{ugc.top_post.snippet}"</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-warm-500 tabular-nums">
                              {typeof ugc.top_post.views === 'number' && <span>{formatNum(ugc.top_post.views)} views</span>}
                              {typeof ugc.top_post.likes === 'number' && <span>{formatNum(ugc.top_post.likes)} reactions</span>}
                            </div>
                          </div>
                          {!maskHandles && ugc.top_post.link && (
                            <a href={ugc.top_post.link} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand/80 shrink-0">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}</div>
      ))}
    </>
  );
}
