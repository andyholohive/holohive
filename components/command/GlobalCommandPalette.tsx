'use client';

/**
 * Global command palette — ⌘K / Ctrl+K from any authenticated page.
 *
 * [2026-09-04] The portal had 25 per-page search boxes and no way to jump
 * across them: finding a KOL meant remembering it lives under /kols, going
 * there, waiting for the roster, then searching. This is the one search
 * box that knows about everything the sidebar knows about (pages, gated by
 * the same isItemAvailable the sidebar uses) plus the three entity types
 * people actually look for by name: clients, campaigns, KOLs.
 *
 * Data: entities are fetched once, lazily, the first time the palette
 * opens (three parallel selects, id + name + a couple of display fields,
 * capped at 400 rows each) and kept for the session. Matching is cmdk's
 * built-in fuzzy filter over `value` + `keywords`. Guests never see the
 * entity groups — RLS would hide most rows anyway, but there is no reason
 * to even ask.
 *
 * Recents: the last 8 things opened from here, in localStorage, shown
 * before you type. Cleared per browser, never synced.
 *
 * Opening: ⌘K listener lives here (mounted once from Sidebar). The Legacy
 * Sales page has its own ⌘K palette scoped to opportunities; it
 * preventDefaults first, so this listener yields to it.
 */

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Command as CommandPrimitive } from 'cmdk';
import {
  ArrowRight,
  Building2,
  Clock,
  CornerDownLeft,
  Crown,
  Megaphone,
  Search,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { NAV_REGISTRY, isItemAvailable, type NavItemDef } from '@/components/SidebarCustomize';
import { useAuth } from '@/contexts/AuthContext';
import { useGuestPermissions } from '@/hooks/useGuestPermissions';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export const OPEN_COMMAND_PALETTE_EVENT = 'hh:open-command-palette';

/** Programmatic open — the sidebar trigger and the mobile topbar use this. */
export function openCommandPalette() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

type EntityKind = 'client' | 'campaign' | 'kol';

interface Entity {
  kind: EntityKind;
  id: string;
  name: string;
  href: string;
  /** Muted line under the name. */
  meta?: string;
  /** Right-aligned status pill. */
  status?: { label: string; tone: BadgeTone };
  image?: string | null;
  keywords: string[];
}

interface Recent {
  href: string;
  label: string;
  kind: EntityKind | 'page';
  image?: string | null;
}

const RECENTS_KEY = 'hh:command-palette:recents';

function fold(s: string) {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * cmdk filter: every whitespace-separated token of the query must be a
 * substring of the item's value or one of its keywords. Score prefers a
 * match at the start of the value, then at a word boundary, then anywhere.
 * Returns 0 (hidden) otherwise — no subsequence matching.
 */
function scoreItem(value: string, search: string, keywords?: string[]): number {
  const q = fold(search).trim();
  if (!q) return 1;
  const v = fold(value);
  const haystack = [v, ...(keywords ?? []).filter((k): k is string => typeof k === 'string').map(fold)];
  let score = 0;
  for (const token of q.split(/\s+/)) {
    let best = 0;
    for (const h of haystack) {
      const idx = h.indexOf(token);
      if (idx < 0) continue;
      const s = idx === 0 ? 3 : /\s|[·@/(]/.test(h[idx - 1]) ? 2 : 1;
      // Matches in the primary value outrank keyword matches.
      best = Math.max(best, h === v ? s + 3 : s);
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}
const RECENTS_MAX = 8;
const ENTITY_LIMIT = 400;

function readRecents(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Drop entries written by the first deploy, which pointed clients at a
    // /clients/<id> route that does not exist.
    return parsed
      .filter((r) => r && typeof r.href === 'string' && !/^\/clients\/[^/?]+$/.test(r.href) && !r.href.startsWith('/clients?clientId='))
      .slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

function pushRecent(r: Recent) {
  try {
    const next = [r, ...readRecents().filter((x) => x.href !== r.href)].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* private mode etc. — recents are a nicety */
  }
}

const CLIENT_STATUS_TONES: Record<string, BadgeTone> = {
  active: 'brand',
  onboarding: 'info',
  paused: 'warning',
  churned: 'neutral',
  completed: 'success',
};

const CAMPAIGN_STATUS_TONES: Record<string, BadgeTone> = {
  active: 'brand',
  draft: 'neutral',
  planning: 'info',
  paused: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

/** cmdk calls .trim() on every keyword — anything that isn't a non-empty
 *  string (arrays, numbers, null from a jsonb/text[] column) crashes the
 *  whole React tree. Flatten and keep strings only. [2026-09-04 hotfix] */
function kw(...parts: unknown[]): string[] {
  const out: string[] = [];
  for (const p of parts.flat(2)) {
    if (typeof p === 'string' && p.trim()) out.push(p);
    else if (typeof p === 'number') out.push(String(p));
  }
  return out;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchEntities(): Promise<Entity[]> {
  const [clients, campaigns, kols] = await Promise.all([
    (supabase as any)
      .from('clients')
      .select('id, name, logo_url, engagement_status, is_active, location')
      .is('archived_at', null)
      .order('name')
      .limit(ENTITY_LIMIT),
    (supabase as any)
      .from('campaigns')
      .select('id, name, status, region, clients!campaigns_client_id_fkey(name)')
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(ENTITY_LIMIT),
    (supabase as any)
      .from('master_kols')
      .select('id, name, profile_picture_url, platform, region, niche, link')
      .is('archived_at', null)
      .order('name')
      .limit(ENTITY_LIMIT),
  ]);

  const out: Entity[] = [];

  for (const c of clients.data ?? []) {
    const status = str(c.engagement_status) || (c.is_active ? 'active' : 'inactive');
    out.push({
      kind: 'client',
      id: String(c.id),
      name: str(c.name) || 'Untitled client',
      // /clients has no [id] page, and ?clientId= opens the Edit form —
      // wrong intent for a search hit. ?q= filters the grid to the card.
      href: `/clients?q=${encodeURIComponent(str(c.name) || '')}`,
      meta: str(c.location),
      status: { label: titleCase(status), tone: CLIENT_STATUS_TONES[status] ?? 'neutral' },
      image: str(c.logo_url) ?? null,
      keywords: kw('client', c.location),
    });
  }

  for (const c of campaigns.data ?? []) {
    const clientName = str(c.clients?.name);
    const region = str(c.region);
    const status = str(c.status);
    out.push({
      kind: 'campaign',
      id: String(c.id),
      name: str(c.name) || 'Untitled campaign',
      href: `/campaigns/${c.id}`,
      meta: [clientName, region].filter(Boolean).join(' · ') || undefined,
      status: status
        ? { label: titleCase(status), tone: CAMPAIGN_STATUS_TONES[status] ?? 'neutral' }
        : undefined,
      keywords: kw('campaign', clientName, region),
    });
  }

  for (const k of kols.data ?? []) {
    const name = str(k.name) || 'Unnamed KOL';
    const handle = typeof k.link === 'string' ? k.link.replace(/^https?:\/\/(www\.)?(x|twitter|t)\.(com|me)\//i, '@').replace(/\/.*$/, '') : '';
    const platform = str(k.platform) ?? (Array.isArray(k.platform) ? k.platform.filter((x: unknown) => typeof x === 'string').join(', ') : undefined);
    const region = str(k.region);
    out.push({
      kind: 'kol',
      id: String(k.id),
      name,
      href: `/kols?q=${encodeURIComponent(name)}`,
      meta: [platform, region, handle.startsWith('@') ? handle : null].filter(Boolean).join(' · ') || undefined,
      image: str(k.profile_picture_url) ?? null,
      keywords: kw('kol', k.platform, k.region, k.niche, handle),
    });
  }

  return out;
}

const KIND_META: Record<EntityKind, { heading: string; icon: React.ElementType }> = {
  client: { heading: 'Clients', icon: Building2 },
  campaign: { heading: 'Campaigns', icon: Megaphone },
  kol: { heading: 'KOLs', icon: Crown },
};

function Thumb({ image, name, icon: Icon, className }: { image?: string | null; name: string; icon: React.ElementType; className?: string }) {
  const [broken, setBroken] = React.useState(false);
  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        onError={() => setBroken(true)}
        className={cn('h-7 w-7 rounded-md object-cover ring-1 ring-cream-200 bg-white shrink-0', className)}
      />
    );
  }
  const initials = (name || '?')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
  return (
    <div className={cn('h-7 w-7 rounded-md bg-brand-light text-brand text-[11px] font-semibold flex items-center justify-center shrink-0', className)}>
      {initials || <Icon className="h-3.5 w-3.5" />}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-cream-300 bg-cream-50 px-1.5 font-sans text-[10px] font-medium text-ink-warm-500 shadow-[0_1px_0_rgba(20,40,45,0.06)]">
      {children}
    </kbd>
  );
}

class PaletteBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('[command-palette] disabled after error:', err); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function GlobalCommandPalette() {
  return (
    <PaletteBoundary>
      <GlobalCommandPaletteInner />
    </PaletteBoundary>
  );
}

function GlobalCommandPaletteInner() {
  const router = useRouter();
  const pathname = usePathname();
  const { userProfile } = useAuth();
  const { isGuest, canView, hasMemberGrant, roleView, isGuestView } = useGuestPermissions();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [entities, setEntities] = React.useState<Entity[] | null>(null);
  const [loadingEntities, setLoadingEntities] = React.useState(false);
  const fetchStartedRef = React.useRef(false);
  const [recents, setRecents] = React.useState<Recent[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const guestUser = isGuest || isGuestView;

  // ⌘K / Ctrl+K — yields to any page that already claimed the chord.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Lazy entity load on first open (once per session, guarded by a ref so
  // the effect's own state updates can't restart or cancel it); recents
  // refresh on every open.
  React.useEffect(() => {
    if (!open) return;
    setRecents(readRecents());
    if (guestUser || fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    setLoadingEntities(true);
    fetchEntities()
      .then(setEntities)
      .catch(() => setEntities([]))
      .finally(() => setLoadingEntities(false));
  }, [open, guestUser]);

  // Reset the query when closed so reopening starts clean.
  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Focus the input ourselves. onOpenAutoFocus is prevented (Radix's own
  // focus lands on the dialog and scrolls the page), and React's autoFocus
  // does not fire reliably for an input mounted inside the portal — the
  // result was ⌘K opening with focus still on <body>, so typing went
  // nowhere until you clicked the field. [2026-09-04]
  React.useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const pages = React.useMemo(() => {
    const ctx = { isGuest: guestUser, role: roleView ?? userProfile?.role, canView, hasMemberGrant };
    return NAV_REGISTRY.filter((item) => isItemAvailable(item, ctx));
  }, [guestUser, roleView, userProfile?.role, canView, hasMemberGrant]);

  const go = React.useCallback((href: string, recent?: Recent) => {
    setOpen(false);
    if (recent) pushRecent(recent);
    router.push(href);
  }, [router]);

  const trimmed = query.trim();
  const byKind = React.useMemo(() => {
    const groups: Record<EntityKind, Entity[]> = { client: [], campaign: [], kol: [] };
    for (const e of entities ?? []) groups[e.kind].push(e);
    return groups;
  }, [entities]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          'top-[14vh] translate-y-0 max-w-[640px] w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden',
          'rounded-2xl border border-cream-300/80 bg-white/95 backdrop-blur-xl',
          'shadow-[0_24px_64px_-12px_rgba(22,20,15,0.28),0_1px_0_rgba(255,255,255,0.6)_inset]',
          '[&>button]:hidden',
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Search Holo Hive</DialogTitle>
        <CommandPrimitive
          label="Search Holo Hive"
          loop
          filter={scoreItem}
          className="flex flex-col"
        >
          {/* Input row */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-cream-200">
            <Search className="h-[18px] w-[18px] text-ink-warm-400 shrink-0" />
            <CommandPrimitive.Input
              ref={inputRef}
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search clients, campaigns, KOLs, pages…"
              className="flex-1 h-full bg-transparent text-[15px] text-ink-warm-900 placeholder:text-ink-warm-400 outline-none"
            />
            <Kbd>esc</Kbd>
          </div>

          <CommandPrimitive.List
            className={cn(
              'max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain py-2',
              '[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5',
              '[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-ink-warm-400',
            )}
          >
            <CommandPrimitive.Empty className="px-4 py-10 text-center">
              <div className="text-sm text-ink-warm-700">
                {loadingEntities ? 'Loading…' : `No matches for “${trimmed}”`}
              </div>
              {!loadingEntities && (
                <div className="mt-1 text-xs text-ink-warm-400">Try a client, campaign, KOL, or page name.</div>
              )}
            </CommandPrimitive.Empty>

            {/* Recents — only while the box is empty */}
            {!trimmed && recents.length > 0 && (
              <CommandPrimitive.Group heading="Recent">
                {recents.map((r) => (
                  <PaletteItem
                    key={`recent:${r.href}`}
                    value={String(r.label ?? '')}
                    keywords={kw('recent', r.href)}
                    onSelect={() => go(r.href, r)}
                    leading={
                      r.kind === 'page'
                        ? <IconTile icon={Clock} />
                        : <Thumb image={r.image} name={r.label} icon={KIND_META[r.kind].icon} />
                    }
                    label={r.label}
                    meta={r.kind === 'page' ? r.href : KIND_META[r.kind].heading.replace(/s$/, '')}
                  />
                ))}
              </CommandPrimitive.Group>
            )}

            {/* Entities */}
            {!guestUser && (['client', 'campaign', 'kol'] as EntityKind[]).map((kind) => {
              const rows = byKind[kind];
              if (rows.length === 0) return null;
              const { heading, icon } = KIND_META[kind];
              return (
                <CommandPrimitive.Group key={kind} heading={heading}>
                  {rows.map((e) => (
                    <PaletteItem
                      key={`${e.kind}:${e.id}`}
                      value={e.name}
                      keywords={e.keywords}
                      onSelect={() => go(e.href, { href: e.href, label: e.name, kind: e.kind, image: e.image })}
                      leading={<Thumb image={e.image} name={e.name} icon={icon} />}
                      label={e.name}
                      meta={e.meta}
                      trailing={e.status ? <StatusBadge tone={e.status.tone} size="sm">{e.status.label}</StatusBadge> : undefined}
                    />
                  ))}
                </CommandPrimitive.Group>
              );
            })}

            {/* Pages */}
            <CommandPrimitive.Group heading="Pages">
              {pages.map((p: NavItemDef) => (
                <PaletteItem
                  key={`page:${p.href}`}
                  value={p.label}
                  keywords={kw(p.href, p.section, 'page')}
                  onSelect={() => go(p.href, { href: p.href, label: p.label, kind: 'page' })}
                  leading={<IconTile icon={p.icon} />}
                  label={p.label}
                  meta={p.section}
                  trailing={pathname === p.href ? <span className="text-[10px] uppercase tracking-wider text-ink-warm-400">Current</span> : undefined}
                />
              ))}
            </CommandPrimitive.Group>
          </CommandPrimitive.List>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 px-4 h-10 border-t border-cream-200 bg-cream-50/70 text-[11px] text-ink-warm-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
              <span className="flex items-center gap-1"><Kbd><CornerDownLeft className="h-3 w-3" /></Kbd> open</span>
            </div>
            <div className="flex items-center gap-1.5 text-ink-warm-400">
              {entities && !guestUser ? (
                <span>{entities.length.toLocaleString('en-US')} records · {pages.length} pages</span>
              ) : (
                <span>{pages.length} pages</span>
              )}
            </div>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function IconTile({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="h-7 w-7 rounded-md bg-cream-100 text-ink-warm-500 flex items-center justify-center shrink-0 ring-1 ring-cream-200">
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function PaletteItem({
  value,
  keywords,
  onSelect,
  leading,
  label,
  meta,
  trailing,
}: {
  value: string;
  keywords?: string[];
  onSelect: () => void;
  leading: React.ReactNode;
  label: string;
  meta?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className={cn(
        'group relative mx-2 flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer select-none outline-none',
        'text-ink-warm-800 transition-colors duration-75',
        'data-[selected=true]:bg-cream-100 data-[selected=true]:text-ink-warm-900',
        'data-[selected=true]:shadow-[inset_3px_0_0_#3e8692]',
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium leading-tight truncate">{label}</div>
        {meta && <div className="text-[11.5px] text-ink-warm-400 leading-tight truncate mt-0.5">{meta}</div>}
      </div>
      {trailing}
      <ArrowRight className="h-3.5 w-3.5 text-ink-warm-300 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity shrink-0" />
    </CommandPrimitive.Item>
  );
}
