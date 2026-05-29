# Project conventions — read this before building UI

Andy is the primary maintainer of this Next.js + Supabase app
(HoloHive Portal). When generating new pages or components, **use
the project's existing primitives, not raw Tailwind / native HTML**.
Drift from these conventions is the #1 review feedback. Following
them removes a whole class of "make it look like the other pages"
follow-ups.

If you're tempted to write `className="bg-brand text-white"` or
`<Input type="date">`, stop — there's a wrapper for that.

---

## The standard page shell

```tsx
import { PageHeader } from '@/components/ui/page-header';

export default function MyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={SomeIcon}
        title="My Page"
        subtitle="One-line description"
        actions={(
          <>
            <Button variant="outline" size="sm"><Download />Export</Button>
            <Button variant="brand" size="sm"><Plus />New</Button>
          </>
        )}
      />
      {/* … */}
    </div>
  );
}
```

**Never** wrap pages in `p-6 max-w-7xl mx-auto` — the layout already
provides that. Use `space-y-6` as the outer.

**Never** roll your own h1/h2 + flex header — use `PageHeader`. It
locks h2 + text-2xl + font-bold + icon position + action-slot
responsive wrap.

---

## Buttons

| Use case | Pattern |
|---|---|
| Primary CTA ("New", "Save", "Create") | `<Button variant="brand">` |
| Secondary action ("Export", "Cancel") | `<Button variant="outline">` |
| Destructive ("Delete", "Archive") | `<Button variant="destructive">` |
| Inline icon button | `<Button variant="ghost" size="sm" className="h-7 w-7 p-0">` |

**Forbidden:**
- `className="bg-brand text-white hover:opacity-90"` — use `variant="brand"`. The variant uses `hover:bg-brand/90` which darkens cleanly; the opacity hack washes out.
- `style={{ backgroundColor: '#3e8692' }}` — same. There are 264 of these to migrate; don't add more.

---

## Required-field labels

When a field is required, the asterisk goes in a **red** wrapper, not
plain text inside the label. There's a tiny shared component for it:

```tsx
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';

<Label>Name <RequiredAsterisk /></Label>
<Label htmlFor="email">Your Email <RequiredAsterisk /></Label>
```

**Forbidden:** writing `<Label>Name *</Label>` — the asterisk
inherits the label's gray/black color which fails the "required
marker should be visually distinct" UX convention. Andy will flag it.

For inline / table-row inputs that previously used `placeholder="Type *"`,
drop the asterisk from the placeholder and wrap the field with a
`<RequiredAsterisk />` sibling that conditionally renders while the
value is empty:

```tsx
<div className="flex items-center gap-1">
  <Input
    value={form.name}
    onChange={(e) => setForm({ ...form, name: e.target.value })}
    placeholder="Contact name"
    className="focus-brand flex-1"
  />
  {!form.name && <RequiredAsterisk />}
</div>
```

This keeps the asterisk red and only shows it while the field is
unfilled — the same UX intent as a label asterisk, but works for
spaces where there's no room for a full Label.

---

## Inputs / Selects / Textareas

**Always add `focus-brand`** (the project's brand-teal focus ring utility):

```tsx
<Input className="h-9 focus-brand" />
<Select><SelectTrigger className="h-9 focus-brand">…</SelectTrigger></Select>
<Textarea className="focus-brand" />
```

Without it, the default blue browser focus ring breaks visual consistency.

---

## Date pickers

**Never use `<Input type="date">`.** Native pickers are unstyled,
inconsistent across browsers, and visually clash with the rest of
the form.

The standard is **Popover + Button trigger + Calendar widget** with
brand-teal selection. See `app/expenses/page.tsx` `DateField` helper
for the canonical wrapper. The base pattern:

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" className="h-9 w-full justify-start font-normal focus-brand">
      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
      {value ? formatted : 'Select date'}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
    <Calendar
      mode="single"
      selected={...}
      onSelect={...}
      classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
      modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
    />
  </PopoverContent>
</Popover>
```

---

## Stat / KPI cards

The standard pattern (see `app/wallets/page.tsx` `KpiCard`):

```tsx
function KpiCard({ icon: Icon, label, value, sub, tone }) {
  const accent = tone === 'good' ? 'text-emerald-700'
    : tone === 'warn' ? 'text-amber-700'
    : 'text-gray-900';
  return (
    <Card className="border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </Card>
  );
}
```

Always `tabular-nums` on numeric values. Always `[11px]` uppercase
tracked-out labels. Always `text-2xl font-bold` value.

---

## Empty states / Loading states

Both have shared components — use them:

```tsx
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

{loading ? <Skeleton className="h-24 rounded-lg" />
  : items.length === 0 ? (
    <EmptyState
      icon={SomeIcon}
      title="No items match"
      description="Try widening the filter."
    />
  ) : (
    // ...
  )}
```

**Never** write inline `<div className="p-10 text-center text-sm text-gray-400">No items</div>` or `"Loading…"` text — both have wrappers that look better and match other pages.

---

## Filter bars

The convention (see `app/wallets/page.tsx`) is filters **inside the
same Card as the table** with a `border-b` separator, not as a
standalone Card stacked above:

```tsx
<Card className="border-gray-200 overflow-hidden">
  <div className="p-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
    <FilterIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
    <Select>…</Select>
    <Select>…</Select>
    <div className="ml-auto text-xs text-gray-500">N items</div>
  </div>
  <Table>…</Table>
</Card>
```

---

## Toasts

```tsx
import { useToast } from '@/hooks/use-toast';  // ← note: /hooks, not /components/ui

const { toast } = useToast();
toast({ title: 'Saved', description: 'Optional detail' });
toast({ title: 'Failed', description: err.message, variant: 'destructive' });
```

---

## Sidebar entries

Two places to register a new page (both required for sidebar to
work correctly):

1. **`components/Sidebar.tsx`** — the rendered JSX. Add a `<NavItem
   href="/your-page" icon={SomeIcon} label="Your Page" />` in the
   right section, gated by role if needed:

   ```tsx
   {userProfile?.role === 'super_admin' && <NavItem href="/expenses" icon={DollarSign} label="Expenses" />}
   ```

2. **`components/SidebarCustomize.tsx`** — the registry. Add an entry
   so the customize dialog can show it:

   ```tsx
   { href: '/expenses', label: 'Expenses', icon: DollarSign, section: 'Documents', requiredRole: 'super_admin' },
   ```

Forgetting #2 means the page renders in the sidebar but can't be
bookmarked or hidden via the customize dialog. Both files share the
lucide icon imports — add yours to both.

---

## API routes — auth pattern

Three middleware layers (per `middleware.ts`):

1. **Public allowlist** — `/api/cron/*`, `/api/webhooks/*`, `/api/forms/submit`. No auth.
2. **CRON_SECRET bypass** — server-to-server calls with `Authorization: Bearer ${CRON_SECRET}` pass through.
3. **Default** — requires Supabase session cookie.

For any new admin-only route, use `lib/requireSuperAdmin.ts`:

```tsx
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  // ...
}
```

For admin-or-super-admin, write a similar helper or check
`userProfile.role` in `['admin', 'super_admin']`.

**Never** use `@supabase/ssr`'s `{get, set, remove}` cookies adapter
directly — 0.7+ throws on it. Use `@/lib/supabase-server` helper
instead (which uses the modern `getAll/setAll` pattern).

---

## Cron jobs

When adding a new cron:

1. Create `app/api/cron/<name>/route.ts` with `Bearer ${CRON_SECRET}` auth
2. Register in `vercel.json` under `crons`
3. Log to `agent_runs` with a unique `agent_name` (e.g. `'EXPENSE_RECURRENCE'`)
4. Add the expected daily max to `app/api/cron/cron-health-check/route.ts`'s `EXPECTED_DAILY_MAX` map so anomalies fire alerts

The cron-health-check sweeps daily at 08:00 UTC. Failures DM Andy via the configured Telegram chat.

---

## Database migrations

Schema lives in two places — `supabase/migrations/` (4 stale files
from Jan 2026, out of sync with prod) and the live DB (modified
via MCP / direct SQL).

For new tables: use `mcp__supabase__apply_migration` to ship the
migration via the MCP tool. Don't add files to `supabase/migrations/`
unless the user explicitly asks to reconcile that folder.

For any new column with a check constraint, add an `idx_*` index on
the column if it'll be filtered on in queries.

For soft-delete, use `deleted_at timestamptz` (not a boolean
`is_deleted`). Then add `WHERE deleted_at IS NULL` in default queries
and `.is('deleted_at', null)` in Supabase JS.

---

## File sizes — don't make giant page files

There are 3 monstrous files in this codebase:
- `app/crm/sales-pipeline/page.tsx` (8,700 lines)
- `app/campaigns/[id]/page.tsx` (11,000+ lines)
- `app/public/portal/[id]/page.tsx` (2,800 lines)

These are bug magnets — every change has unbounded blast radius.

When adding new pages, **target <1,500 lines**. Extract:
- Component-level pieces (dialogs, slide-overs, table cells) into separate functions in the same file
- Reusable components into `components/<feature>/` folder

If you find yourself past 1,500 lines, that's the signal to split.

---

## Memory + recently-shipped context

Project memory lives at:
`/Users/andylee/.claude/projects/-Users-andylee-Downloads-KOL-Campaign-Manager/memory/`

- `MEMORY.md` — index of project facts
- `user_profile.md` — Andy / HoloHive context
- `project_crm_rebuild.md` — the 4.9-week CRM rebuild Andy is the dev on. Spec lives in `/Users/andylee/Downloads/CRM/`.

**Read MEMORY.md at session start** if context matters for the task.

---

## Recently shipped (for the next session — replace as we ship)

- `2026-05-29` — Expense tracking (super-admin only, recurrence cron, attachments). New `lib/requireSuperAdmin.ts` guard, new `KpiCard` + `DateField` patterns documented above.
- `2026-05-29` — Cron-health-check sweep (`/api/cron/cron-health-check`) — DMs Andy via TG on cron failures or runaway frequency.
- `2026-05-28` — Discovery cron 401 bug fixed (middleware now accepts `Bearer CRON_SECRET` for server-to-server).
- `2026-05-27` — Daily Telegram metrics cron, active-clients + 48h-old filter.
- `2026-05-27` — Client portal: live X / Telegram post embeds replacing static link card; hidden-KOL exclusion from tracker totals.

---

**TL;DR:** if you're about to write a `<div>` that lays out a page, a `<button>` that's brand-colored, or a `<Input type="date">` — stop and check if there's already a wrapper in `@/components/ui/*` or in this doc.
