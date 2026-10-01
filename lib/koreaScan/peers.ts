/**
 * Korea Scan — who a project is compared against.
 *
 * Curated sets carry hand-checked Korean spellings and exclusions (the perp
 * set is the field from Yano's RISE scan, 15 Sep 2026). Every Korea Signal
 * category is also offered as a set, built from mindshare_projects'
 * tracked_keywords, so any project can be scanned against its category.
 */

import type { MatchSpec } from './classify';

export interface ScanSubject extends MatchSpec {
  name: string;
  /** A Holo Hive client (mindshare_projects.client_id set). */
  isClient?: boolean;
}

export interface PeerSet {
  id: string;
  label: string;
  /** What the field is, in words, for the graphics ("pre-TGE perp DEXs"). */
  field: string;
  members: ScanSubject[];
}

export const CURATED_SETS: PeerSet[] = [
  {
    id: 'perp-dex',
    label: 'Perp DEXs',
    field: 'perp DEXs',
    members: [
      { name: 'Hyperliquid', aliases: ['하이퍼리퀴드', 'Hyperliquid', 'HYPE'] },
      { name: 'GRVT', aliases: ['그래비티', 'GRVT'] },
      { name: 'Lighter', aliases: ['라이터', 'lighter.xyz', 'Lighter'], exclude: ['플라이터', '라이터스'] },
      { name: 'Variational', aliases: ['배리에이셔널', 'Variational'] },
      { name: 'Arcus', aliases: ['아커스', 'Arcus'] },
      { name: 'Pacifica', aliases: ['퍼시피카', 'Pacifica'] },
      { name: 'Extended', aliases: ['익스텐디드', 'extended.exchange'] },
      { name: 'Aster', aliases: ['아스터', 'AsterDEX', 'Aster'] },
      { name: 'Hibachi', aliases: ['히바치', 'Hibachi'] },
      { name: 'StandX', aliases: ['스탠드엑스', 'StandX'] },
      { name: 'Dango', aliases: ['댕고', 'Dango'] },
      { name: 'TxFlow', aliases: ['티엑스플로우', 'TxFlow'] },
      { name: 'Ondo Perps', aliases: ['온도 퍼프', 'Ondo Perps', 'Ondo Perp'] },
      {
        name: 'RISE', aliases: ['라이즈엑스', '라이즈X', 'RISEx', 'RiseX', 'RISE Chain', 'rise.trade', '라이즈'],
        exclude: ['엔터프라이즈', '서프라이즈', '선라이즈', '프라이즈', '블록라이즈', '폴러라이즈', '업라이즈', 'RIIZE', '라이즈 멤버', '라이즈 컴백'],
      },
    ],
  },
];

/** Korea Signal tracked projects, as stored. */
export interface TrackedProject {
  name: string;
  category: string | null;
  tracked_keywords: string[] | null;
  client_id?: string | null;
}

/** Category sets from Korea Signal, e.g. "AI · 7 projects". */
export function categorySets(projects: TrackedProject[]): PeerSet[] {
  const byCat = new Map<string, ScanSubject[]>();
  for (const p of projects) {
    if (!p.category || !p.tracked_keywords?.length) continue;
    const list = byCat.get(p.category) ?? [];
    list.push({ name: p.name, aliases: p.tracked_keywords, isClient: !!p.client_id });
    byCat.set(p.category, list);
  }
  return [...byCat.entries()]
    .filter(([, m]) => m.length >= 3)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, members]) => ({ id: `category:${cat}`, label: `${cat} (Korea Signal)`, field: `${cat} projects`, members }));
}

/** Drops the subject from its own field, matching by name. */
export function peersFor(set: PeerSet, subjectName: string): ScanSubject[] {
  const n = subjectName.trim().toLowerCase();
  return set.members.filter((m) => m.name.toLowerCase() !== n);
}
