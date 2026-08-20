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

## Every new page needs a `layout.tsx` — this is step 1

**A page without one renders with no sidebar and no auth gate.** There is
no global sidebar in `app/layout.tsx`; each route folder opts in by
providing its own layout. Miss it and the page still builds, still type-
checks, still passes the linter, and looks obviously wrong the moment
anyone opens it. This was missed on `/repost-deals` (2026-08-20) and only
surfaced from a screenshot.

So before writing `page.tsx`, create `app/<route>/layout.tsx`:

```tsx
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Sidebar from '@/components/Sidebar';

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Sidebar>{children}</Sidebar>
    </ProtectedRoute>
  );
}
```

That exact file is the default — it is already the most-duplicated layout
in the repo. Re-exporting another section's copy
(`export { default } from '../clients/layout';`) is an equally accepted
variant and some pages use it; prefer the explicit version for new routes
so the file reads on its own.

`ProtectedRoute` only gates *authentication*. Role gating stays in
`page.tsx` (or the API routes behind it) — see `/expenses` and
`/repost-deals`, both super-admin, both gated at the page rather than the
layout.

**Public pages are the deliberate exception.** Anything under
`app/public/**` must NOT get this layout — no sidebar, no auth. It has its
own `app/public/layout.tsx`.

### New-page checklist

1. `app/<route>/layout.tsx` — the file above. Without it: no sidebar.
2. `app/<route>/page.tsx` — the shell below.
3. `components/Sidebar.tsx` — a `NavItem`, in the right section.
4. `components/SidebarCustomize.tsx` — the matching registry entry.
   Both, or neither.
5. `SECTION_PREFIXES` in `Sidebar.tsx` — add the route so the correct
   section auto-expands when someone lands on it.

Steps 3–5 are the ones an audit catches later; step 1 is the one the user
catches immediately.

## The standard page shell

Copy-paste this as the starting point for any new admin page. It
covers loading, empty, and loaded branches with the canonical
primitives:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/ui/kpi-card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Plus, Download, Handshake } from 'lucide-react';

export default function MyPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);

  // ... fetch ...

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Handshake}
        title="My Page"
        subtitle="One-line description of what the user does here"
        actions={(
          <>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />Export
            </Button>
            <Button variant="brand" size="sm">
              <Plus className="h-4 w-4 mr-2" />New
            </Button>
          </>
        )}
      />

      {loading ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No items yet"
          description="Add your first item to get started."
        >
          <Button variant="brand">
            <Plus className="h-4 w-4 mr-2" />Add First Item
          </Button>
        </EmptyState>
      ) : (
        // ... actual content ...
        null
      )}
    </div>
  );
}
```

**Never** wrap pages in `p-6 max-w-7xl mx-auto` — the layout already
provides that. Use `space-y-6` as the outer.

**Never** wrap pages in `min-h-[calc(100vh-64px)] bg-gray-50` +
white-Card outer. The workspace section (`/tasks`, `/reminders`, etc.)
used to do this; it was migrated out in the May 2026 audit. The
sidebar layout already provides the gray background and full height.

**Never** roll your own h1/h2 + flex header — use `PageHeader`. It
locks h2 + text-2xl + font-bold + icon position + action-slot
responsive wrap.

### Loading branch — render `PageHeader` immediately

The loading branch of a page should render the same `PageHeader` as
the loaded branch so the title doesn't shift when data arrives.
Only the data sections below get skeletoned:

```tsx
if (loading) {
  return (
    <div className="space-y-6">
      <PageHeader icon={SomeIcon} title="..." subtitle="..." actions={skeletons} />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
```

### Sub-route back-buttons

When a page is a sub-route (e.g. `/clients/[id]/delivery-log`,
`/dashboard/check-in`), put the back link **above** the PageHeader, not
inside it. Use a text Link for lightweight back-affordances:

```tsx
<Link href="/dashboard" className="inline-flex items-center text-xs text-gray-500 hover:text-brand transition-colors w-fit">
  <ArrowLeft className="h-3 w-3 mr-1" />
  Back to Dashboard
</Link>
<PageHeader icon={...} title="..." subtitle="..." />
```

For prominent back-affordances (e.g. a profile sub-page where the
back action is part of the task), use a ghost Button:

```tsx
<Button asChild variant="ghost" size="sm" className="-ml-2 h-8 w-fit">
  <Link href="/clients">
    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
    Back to Clients
  </Link>
</Button>
```

---

## Buttons

| Use case | Pattern |
|---|---|
| Primary CTA ("New", "Save", "Create") | `<Button variant="brand">` |
| Secondary action ("Export", "Cancel") | `<Button variant="outline">` |
| Destructive ("Delete", "Archive") | `<Button variant="destructive">` |
| Inline icon button | `<Button variant="ghost" size="sm" className="h-7 w-7 p-0">` |

**Forbidden on Buttons:**
- `className="bg-brand text-white hover:opacity-90"` — use `variant="brand"`. The variant uses `hover:bg-brand/90` which darkens cleanly; the opacity hack washes out.
- `style={{ backgroundColor: '#3e8692' }}` — same. The May 2026 audit converted 264 of these; don't add more.
- `hover:opacity-90` on ANY `variant="brand"` Button — the variant handles hover internally. This was the most common audit violation.

**Allowed on non-Button decorative elements** (AvatarFallback, count
pills inside Tabs, tab-count badges in dropdowns):
- `bg-brand text-white` for solid brand-tinted decoration — these
  aren't buttons, so `variant="brand"` doesn't apply.

For tab-count badges specifically, prefer the lighter chip:
`bg-brand-light text-brand` (matches `/clients`, `/kols`, `/lists`).

### Inline icon buttons (× chip remove, micro affordances)

Two patterns, depending on context:

**Action-affordance icon button** (toolbar X, row delete, etc.):
```tsx
<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
  <X className="h-4 w-4" />
</Button>
```

**Column-header filter chevron** (h-3 w-3 inside a TableHead,
shows on hover via `group-hover`): a bare `<button>` is fine.
PopoverTrigger's `asChild` works on either, and converting these
micro-affordances to a ghost Button changes their pixel size + adds
an unwanted hover background on the column header. Leave them as
`<button>` with an explicit `type="button"`.

---

## Status badges — use `<StatusBadge>`, not inline pills

Every status pill in the app draws from one centralized 9-tone palette
via `<StatusBadge>`. **Never** roll a `<Badge className="bg-X-100 text-X-800">`
or `<span className="inline-flex … rounded-full bg-X-100 text-X-800">`
inline — those were converted en masse in the May 2026 audit.

```tsx
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';

<StatusBadge tone="success">Complete</StatusBadge>
<StatusBadge tone="warning" size="sm">Pending</StatusBadge>
```

**Tone palette:**

| Tone | Meaning | Use for |
|---|---|---|
| `'neutral'` | gray | Default / unspecified / "draft" |
| `'brand'` | teal | The featured / operationally-important status (Active, Linked) |
| `'success'` | emerald | Complete, paid, delivered, healthy |
| `'warning'` | amber | Paused, needs attention, awaiting reply |
| `'danger'` | rose | Failed, overdue, blocked |
| `'info'` | sky | In-progress, informational, "Curated" |
| `'purple'` | purple | Ready-for-feedback, special-category |
| `'pink'` | pink | Promotional / marketing |
| `'slate'` | slate | Admin / ops |

For free-text status strings, map through a `BadgeTone` lookup:

```tsx
const STATUS_TONES: Record<string, BadgeTone> = {
  active: 'brand',
  completed: 'success',
  paused: 'warning',
  failed: 'danger',
};
<StatusBadge tone={STATUS_TONES[status] ?? 'neutral'}>{status}</StatusBadge>
```

For SelectTrigger className needs (where you want the tone color but
can't render a full component), use `toneClassName(tone)` which returns
just the bg+text class pair.

**Adding a new tone:** add it to `components/ui/status-badge.tsx`'s
`TONE_CLASSES` map, not inline. The whole point of the palette is
that changing teal in one place updates every page.

**Known exception:** `/kols` has 10+ category color systems (Tier S/1/2/3/4,
Niche, Pricing, etc.) that use yellow/orange/indigo/teal/cyan/violet/lime
— colors outside the 9-tone palette. Those local `colorMap` helpers
are documented as an exception (tracked follow-up). Don't replicate
that pattern elsewhere.

---

## Tables — use `<Table>` primitives, not raw `<table>`

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

<Table>
  <TableHeader>
    <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
      <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">When</TableHead>
      <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {rows.map(r => (
      <TableRow key={r.id} className="border-gray-100">
        <TableCell className="py-3">{r.when}</TableCell>
        <TableCell className="py-3"><StatusBadge tone={...}>{r.status}</StatusBadge></TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Standard column-header classes:** `h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500`. Don't drift.

**Standard row body padding:** `py-3` on TableCell. The default `p-4`
makes rows too tall for data-dense admin tables.

**Default:** raw `<table><thead><tr>…</tr></thead><tbody>…</tbody></table>`
is the wrong choice for a read-only data table. Use the primitives.

**The documented exception — v11 spreadsheet surfaces.** As of
2026-08-10 there are 14 files with a raw `<table className=…>`, and
they are not all drift. `/lists`, `/wallets`, `/tasks`,
`/delivery-logs`, `/clients/[id]/delivery-log` and the public
list/campaign/portal tables are *inline-editable spreadsheets*, not
read-only data tables. They need things the shadcn `Table` primitives
don't give you: per-cell `border-r border-cream-200` gridlines, a
solid `bg-cream-50` sticky header, `colSpan` add-a-row inputs, and
drag-reorder cells. Fighting the primitives' defaults to get there
produces worse code than a plain `<table>`.

So the rule is by surface type, not by tag:

| Surface | Use |
|---|---|
| Read-only data table (a list you scan) | `<Table>` primitives |
| Inline-editable spreadsheet (cells you type into) | raw `<table>`, v11 chrome |

If you write a raw `<table>`, match the v11 spreadsheet chrome that
`/delivery-logs` and `/kols` use — `bg-cream-50` header, `text-[10px]
uppercase tracking-[0.18em] text-ink-warm-500` header cells,
`border-r border-cream-200` between columns, wrapped in a
`<Card className="border-cream-200 overflow-hidden">` with an inner
`overflow-x-auto`. Don't invent a third table look.

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

## Date formatting

The canonical format is **mm/dd/yyyy** (en-US, 2-digit month + day, 4-digit
year). Per Andy 2026-06-14. **Never** call `toLocaleDateString` or
`toLocaleString('en-…', …)` directly — always go through
`@/lib/dateFormat`.

```tsx
import { formatDate, formatDateTime, formatRelativeShort } from '@/lib/dateFormat';

formatDate(client.engagement_end_date)   // "12/15/2025"
formatDateTime(meeting.submitted_at)     // "12/15/2025 3:45 PM"
formatRelativeShort(chat.last_message)   // "5m ago" / "3h ago" / "12/15/2025"
formatRelative(activity.created_at)      // "about 2 hours ago"
formatTime(meeting.start_time)           // "3:45 PM"
toIsoDate(form.due_date)                 // "2025-12-15" — STORAGE ONLY, never display
```

**Forbidden:**
- `someDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` — use `formatDate`
- `someDate.toLocaleString('en-US', …)` for dates — use `formatDateTime`
- `'en-GB'` anywhere — the app is en-US throughout
- Raw ISO strings (`{record.created_at}` directly in JSX) — use `formatDate`
- Local copies of "X ago" helpers — use `formatRelativeShort` (terse: `5m / 3h / 2d ago`) or `formatRelative` (verbose: `"2 days ago"`)

The lint rule `no-raw-toLocaleDateString` (in `scripts/lint-conventions.mjs`)
catches drift. Numeric `.toLocaleString()` (e.g. `Number(x).toLocaleString('en-US')`)
is allowed — the rule excludes lines containing `Number(`.

**Legitimate exception:** if you genuinely need a non-mm/dd/yyyy format
(e.g. a "Jun 2026" month+year-only header where mm/dd/yyyy would be
misleading), add a `lint-conventions: disable-next-line no-raw-toLocaleDateString`
comment with a one-line justification above.

---

## Stat / KPI cards

Use the shared `@/components/ui/kpi-card` — the canonical KpiCard.
It's used across `/analytics`, `/dashboard`, `/crm/network`,
`/crm/contacts`, `/crm/submissions`, `/expenses`, and `/wallets` so
the visual treatment is identical everywhere.

```tsx
import { KpiCard } from '@/components/ui/kpi-card';

<KpiCard
  icon={Handshake}
  label="Active Partners"
  value={42}
  sub="3 added this week"
  accent="brand"
/>
```

**Accent palette:** `'gray' | 'brand' | 'emerald' | 'amber' | 'rose' | 'sky' | 'purple'`. Default `'gray'`.

Use the accent prop to colorize the right-side icon square. Use
brand-teal for the most operationally-interesting metric (Active Pipeline,
Total Clients, etc.); reserve emerald for "this is good news",
amber/rose for "this needs attention". Sky / purple for differentiation
when you have 4+ KPIs in a strip.

`value` accepts `string | number` so callers format their own (money,
percentage, "EVM/Solana" splits). The component handles `tabular-nums`,
the uppercase tracked-out label, and the `text-2xl font-bold` value
internally — never roll your own inline variant.

**Forbidden:** local `function KpiCard({ ..., tone })` definitions
inside a page file. There used to be two implementations (the inline
`tone`-prop variant on /expenses + /wallets vs the shared `accent`-prop
one); they were reconciled in the May 2026 audit. If you need a new
accent, add it to the shared component's palette, don't inline a
divergent version.

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

### Skeleton conventions

- **`rounded-xl` for KpiCard skeletons** (matches the actual KpiCard's
  `rounded-xl`):
  ```tsx
  <Skeleton className="h-24 rounded-xl" />
  ```
- **`rounded-lg` for Card-shaped content blocks** (charts, tables,
  list cards):
  ```tsx
  <Skeleton className="h-64 rounded-lg" />
  ```
- **Default `rounded-md` (no override) for small inline things**
  (row cells, chip placeholders).
- **Match the actual content's responsive grid** — if the loaded
  content is `grid-cols-1 md:grid-cols-4`, the skeleton grid should
  be the same, not `grid-cols-3`. Otherwise the layout shifts when
  data loads.
- **Iterate with `Array.from({ length: N }).map((_, i) => …)`**, not
  `[1, 2, 3, 4].map(i => …)`. The audit standardized on the former.

---

## Destructive intent — use `rose-*`, not `red-*`

For destructive text, borders, and backgrounds, use the `rose-*` color
family, not `red-*`. The May 2026 audit converted ~250 instances; the
`StatusBadge` `'danger'` tone is rose, and the workspace section is
rose throughout. Mixing the two looks subtly off — `red-500` and
`rose-500` are visibly different.

```tsx
<p className="text-rose-600">…</p>             // ✅
<Button variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50">
  Remove
</Button>
```

For "I really mean it, this is a destructive primary action" (Confirm
Remove inside a confirmation flow), use `variant="destructive"`:
```tsx
<Button variant="destructive">Confirm Remove</Button>
```

**Forbidden:** `text-red-*`, `border-red-*`, `bg-red-*`. The repo
audit forbids them.

---

## Initials avatars — local helper, don't shadow shared

When you need a circular avatar with initials (team member cards,
chat sender bubbles), define a local `InitialsAvatar` helper — NOT
a `function Avatar()`. The shared `@/components/ui/avatar` exports
the Radix-based `Avatar` primitive; shadowing it confuses imports
and future grep-replace.

```tsx
function InitialsAvatar({ name, src }: { name: string; src?: string | null }) {
  const initials = (name || '?').split(' ').map(w => w.charAt(0).toUpperCase()).join('').slice(0, 2);
  if (src) {
    return (
      <div className="w-10 h-10 rounded-full overflow-hidden">
        <img src={src} alt={`${name} avatar`} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 bg-brand text-white rounded-full flex items-center justify-center font-bold">
      {initials}
    </div>
  );
}
```

Promote to `@/components/ui/initials-avatar` once a second page needs
the same shape. `/dashboard` and `/team` both have local copies right
now — fair candidate for promotion.

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

**Both, or neither.** The registry is the list of *top-level sidebar
entries*, not the list of routes. Three routes are deliberately absent
from it and should stay that way — if an audit flags them, this is
the answer:

| Route | Why it's not in the registry |
|---|---|
| `/chat` (Holo GPT) | Its `NavItem` is commented out in `Sidebar.tsx` (removed 2026-05-05). A registry entry would put a show/hide toggle in the customize dialog that controls nothing. Restore the NavItem first, then register it. |
| `/tasks/deliverables` | A `SubNavItem` that only renders while `pathname.startsWith('/tasks')`. It's a child of HQ, not its own sidebar entry. |
| `/tasks/automations` | Same — contextual HQ sub-nav, admin-gated. |

So the rule is: register a route when it has (or is getting) its own
top-level `NavItem`. Contextual sub-nav and deliberately-hidden routes
don't belong in the customize dialog.

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

### Audit trail on money + content

`payments` and `contents` carry `after insert or update or delete` row
triggers that append to **`record_audit_log`** (`table_name`,
`record_id`, `action`, `actor_id`, `snapshot` jsonb). Added 2026-08-10,
after tracing a $200 payment dead-ended: nothing recorded who created
a payment or who deleted the content it pointed at, and `contents` is
hard-deleted so the row left no trace at all. The `snapshot` column
keeps the row as it was, so a DELETE stays answerable.

Two things to know when you touch these tables:

- **`actor_id` is `auth.uid()`**, so it fills in for browser-side
  writes and is NULL for service-role ones (crons, the TG bot). For
  those paths, set **`created_by`** explicitly — see how
  `createApprovedContentsRow` threads `approvedBy` through from both
  the web review route and the TG approve handler.
- **Don't log these mutations from app code as well.** The trigger
  fires no matter which path wrote the row, which is exactly what
  app-level logging failed to do here — payments are created from at
  least four places.

The table is RLS'd to admin/super_admin SELECT and has no write policy;
the trigger is `security definer`, so it's append-only by construction.
If you add a table that needs the same treatment, attach
`public.fn_record_audit()` rather than writing a second one.

---

## File sizes — don't make giant page files

These are the bug magnets in this codebase (measured 2026-08-10 —
regenerate with `find app -name page.tsx | xargs wc -l | sort -rn`):

| Lines | Page |
|---|---|
| 6,645 | `app/clients/page.tsx` — the biggest by a wide margin |
| 4,242 | `app/kols/page.tsx` |
| 4,008 | `app/public/portal/[id]/page.tsx` |
| 3,878 | `app/crm/telegram/page.tsx` |
| 3,447 | `app/crm/network/page.tsx` |
| 3,422 | `app/forms/[id]/page.tsx` |
| 3,283 | `app/public/campaigns/[id]/page.tsx` |
| 3,229 | `app/campaigns/[id]/page.tsx` — **regrew** (see below) |
| 3,168 | `app/crm/sales-pipeline/page.tsx` |
| 3,096 | `app/lists/page.tsx` |
| 2,505 | `app/admin/telegram-comm/page.tsx` |
| 2,504 | `app/mindshare/page.tsx` |
| 2,317 | `app/tasks/page.tsx` |

`app/campaigns/[id]/page.tsx` was ~11,000 lines before the May 2026
audit and ~2,900 right after the structural split. It's back to 3,229
— the split held but the page has been accreting again. Put new
campaign-tab work in `components/campaign/`, not in the page file.

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

- `2026-05-30` — Repo-wide UI consistency audit. 54 pages aligned to
  the standards in this doc. Specifically:
  - Every `hover:opacity-90` stripped (was 50+ occurrences); every
    `text-red-*` → `text-rose-*` (250+).
  - Two divergent `KpiCard` implementations (`accent` vs `tone` props)
    reconciled to the shared `@/components/ui/kpi-card`.
  - ~50 inline status pills (`<Badge className="bg-X-100 text-X-800">`)
    converted to `<StatusBadge tone={...}>`.
  - Workspace card-shell pattern (`min-h-[calc(100vh-64px)] bg-gray-50`
    + white-Card outer) migrated to standard `space-y-6 + PageHeader`
    across all 10 workspace pages + `/delivery-logs`.
  - `/crm/sales-pipeline` header fixed (sidebar said "Sales", page said
    "Sales Pipeline"; subtitle described implementation philosophy
    instead of user task).
  - This CLAUDE.md updated with all newly-codified patterns.
- `2026-05-29` — Expense tracking (super-admin only, recurrence cron, attachments). New `lib/requireSuperAdmin.ts` guard, `DateField` pattern documented above.
- `2026-05-29` — Cron-health-check sweep (`/api/cron/cron-health-check`) — DMs Andy via TG on cron failures or runaway frequency.
- `2026-05-28` — Discovery cron 401 bug fixed (middleware now accepts `Bearer CRON_SECRET` for server-to-server).
- `2026-05-27` — Daily Telegram metrics cron, active-clients + 48h-old filter.
- `2026-05-27` — Client portal: live X / Telegram post embeds replacing static link card; hidden-KOL exclusion from tracker totals.

---

## Convention linter

The repo has a build-time linter that enforces the most common
patterns from this doc: `scripts/lint-conventions.mjs`.

Run it before pushing:
```bash
npm run lint:conventions   # custom rules only
npm run lint               # next lint + custom rules
```

It catches:
- `text-red-*`, `bg-red-*`, `border-red-*` (use `rose-*`)
- `hover:opacity-90` (use `variant="brand"`)
- `<Input type="date">` (use DateField)
- `placeholder="X *"` patterns (use `<RequiredAsterisk />`)
- `<Button className="bg-brand text-white">` (use `variant="brand"`)
- `min-h-[calc(100vh-64px)] bg-gray-50` card-shell wrappers
- raw `toLocaleDateString` / date-shaped `toLocaleString` (use `@/lib/dateFormat`)

**Scope (widened 2026-08-10):** it now lints `.ts` as well as `.tsx`
under `app/`, `components/`, and `lib/` — 682 files, up from 476.
The 206 files it previously skipped were every API route, every cron,
and the Telegram webhook, i.e. exactly where date formatting drifts
without anyone noticing. One deliberate exception came out of that
widening: `shortDueLabel()` in `app/api/telegram/webhook/route.ts`
uses `weekday: 'short'` so a due date inside the next week renders as
"Mon" on a TG button; anything 7+ days out falls through to
`formatDate`, so mm/dd/yyyy still governs real dates.

If you have a deliberate exception (form-builder preview, centered
account-settings shell, etc.), add a directive:

```tsx
{/* lint-conventions: disable-next-line no-input-type-date */}
<Input type="date" disabled />
```

Or on the same line:

```tsx
<Input type="date" /> {/* lint-conventions: disable-line no-input-type-date */}
```

Comma-separated rule IDs work too, and `*` disables all rules on
that line. **Always add a one-line comment explaining WHY** — future
audits will look at the exception and decide whether the rationale
still holds.

---

**TL;DR for new pages:**

If you're about to write any of these, **stop and use the primitive instead**:

| Tempted to write | Use |
|---|---|
| `<div className="space-y-6"><h2>Title</h2><p>Sub</p>…</div>` | `<PageHeader title="…" subtitle="…" />` |
| `className="bg-brand text-white hover:opacity-90"` on a Button | `variant="brand"` |
| `<Badge className="bg-emerald-100 text-emerald-800">Active</Badge>` | `<StatusBadge tone="success">Active</StatusBadge>` |
| `text-red-600`, `bg-red-50`, `border-red-300` | `text-rose-600`, `bg-rose-50`, `border-rose-300` |
| `<Input type="date">` | Popover + Calendar (see DateField above) |
| `<table><thead>…</thead><tbody>…</tbody></table>` | `<Table><TableHeader>…<TableBody>…` |
| `<div className="p-10 text-center">No items</div>` | `<EmptyState icon={…} title="…" />` |
| `[1, 2, 3, 4].map(i => <Skeleton />)` | `Array.from({ length: 4 }).map((_, i) => <Skeleton />)` |
| Local `function KpiCard({ tone })` | Import the shared `@/components/ui/kpi-card` |
| Local `function Avatar()` | `InitialsAvatar` (don't shadow `@/components/ui/avatar`) |
| `<div className="min-h-[calc(100vh-64px)] bg-gray-50">…<div className="bg-white border…">` | Drop both wrappers, use `<div className="space-y-6">` directly |

A new page that uses these primitives correctly will visually match
the rest of the app on the first try. That's the goal — Andy
shouldn't have to flag the same drift twice.
