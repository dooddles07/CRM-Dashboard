# Architecture

CareFlow CRM is a hospital patient-relationship dashboard built as a front-end application. It
runs entirely in the browser against seed data compiled into the bundle. No server, database, or
external API backs it.

Read this document before adding a route or a data module. It explains where things live and why
they live there.

---

## 1. Scope

| Layer | Status |
|---|---|
| UI, routing, interaction | Built |
| Domain model and types | Built |
| Seed data | Built |
| Session state | Built (in-memory, resets on reload) |
| HTTP API | Not built. See [API.md](API.md) for the proposed contract |
| Database | Not built. See [DATABASE.md](DATABASE.md) for the proposed schema |
| Authentication | Screens only. No credential checking |

The auth screens at `/login`, `/forgot-password`, and `/mfa` present the flows without validating
anything. Any route can be reached directly.

---

## 2. Stack

| Package | Version | Role |
|---|---|---|
| next | 16.3 | App Router, Turbopack |
| react / react-dom | 19.2 | |
| typescript | 6.x | Pinned. TypeScript 7 outruns typescript-eslint support |
| tailwindcss | 4.x | `@theme inline` token layer, no config file |
| eslint | 9.x | Pinned. ESLint 10 breaks the bundled react plugin |
| zustand | 5.x | Session state |
| @tanstack/react-table | 8.x | Pinned. v9 ships a rewritten API |
| recharts | 3.x | Charts |
| @xyflow/react | 12.x | Workflow builder canvas |
| @dnd-kit/core | 6.x | Lead board drag |
| radix-ui | 1.x | Primitive behaviour under `components/ui` |
| cmdk | 1.x | Command palette |
| sonner | 2.x | Toasts |
| next-themes | 0.4 | Light and dark switching |
| react-day-picker | 10.x | Calendar primitive |
| lucide-react | 1.x | Icons |

Three pins carry reasoning worth keeping: TypeScript, ESLint, and TanStack Table all have newer
majors that either break tooling or change APIs without benefit here.

---

## 3. Directory map

```
app/
  (auth)/            login, forgot-password, mfa. Own layout, no shell
  (app)/             every product screen. Wrapped in AppShell
    layout.tsx       force-dynamic, mounts AppShell
    page.tsx         Command Center
    patients/        list, new, [id]
    appointments/    list, calendar, [id]
    leads/           list, [id]
    ...
components/
  ui/                34 shadcn/Radix primitives. Rarely edited
  shell/             rail, top bar, command palette, notification drawer
  data/              DataTable, Panel, PageHeader, KpiCard, charts, states
  healthcare/        StatusChip, Protected, PersonAvatar
  record/            RecordHeader, Spine
  patient/           patient overview and record tabs
  dashboard/         Command Center panels
  pipeline/          lead board
  inbox/             conversation reader
  scheduling/        appointment calendar
  automation/        workflow canvas
  shared/            ParamDialog, StaffTable
lib/
  types.ts           the domain model
  status.ts          status registries
  format.ts          masking, dates, numbers
  store.ts           zustand store
  timeline.ts        Spine builder
  nav.ts             navigation tree
  utils.ts           cn() with the custom class groups
  data/              seed records
docs/
```

Components sit in one of three tiers. `ui/` holds unopinionated primitives. `data/`,
`healthcare/`, `record/`, and `shared/` hold the product vocabulary reused across screens.
Feature folders hold one screen's parts.

---

## 4. Routing

37 page routes across two groups.

`(auth)` renders without the shell. `(app)` wraps everything in `AppShell`, which supplies the
rail, top bar, command palette, and notification drawer.

The `(app)` layout exports `dynamic = "force-dynamic"`. Every screen reads either URL state
(`?tab=`, `?create=`) or in-memory session state, so static prerendering never produced a useful
result, and `useSearchParams` inside the create dialogs made it fail outright.

**Adding a route requires no navigation wiring.** The rail and command palette both map over
`navigation` in `lib/nav.ts`. Add an entry there and both surfaces pick it up.

Active state resolves through `isActive()`, which handles the case where a parent and child both
appear in the rail. `/appointments` stays inactive while you sit on `/appointments/calendar`.

---

## 5. Data flow

```
lib/data/*.ts          static seed arrays, imported directly by screens
        │
        ├──────────────► screens read and filter with useMemo
        │
lib/store.ts (zustand) ─► patients, notifications, auditLog, revealed, UI prefs
        │
        └──────────────► components subscribe with selectors
```

Two sources, split by whether anything mutates.

**Seed modules** hold records nothing writes to during a session: appointments, leads,
complaints, campaigns, workflows. Screens import the array and filter it inside `useMemo`. Each
module exports lookup helpers next to its data (`leadById`, `appointmentsFor`, `staffName`), and
screens use those instead of re-implementing a `find`.

**The store** holds anything that changes: the patient list (creation, archiving), notification
read state, the audit log, which PII values the session revealed, and UI preferences. Components
subscribe with narrow selectors so a density change does not re-render the patient table's rows.

Interactions local to one screen, like dragging a lead or toggling an integration, use component
state. Lifting them to the store would buy persistence across navigation that the demo does not
need.

### The demo clock

`lib/data/constants.ts` fixes `TODAY` at `2026-08-10`. Every seed date derives from it through
`day(offset)` or `at(offset, time)`, and every formatter in `lib/format.ts` measures against it.
The build therefore renders identically on any calendar day. Nothing calls `Date.now()` during
render.

### The Spine

`lib/timeline.ts` merges appointments, follow-ups, conversation messages, tasks, feedback,
referrals, and notes into one reverse-chronological sequence per patient. Every patient gets a
real history instead of only the few with hand-authored events. Lead and complaint detail pages
build smaller event arrays inline and render them through the same `Spine` component.

---

## 6. Component contracts

Two components carry most of the product's consistency.

**`DataTable`** wraps TanStack Table and takes `columns`, `data`, `empty`, and optional
`toolbar`, `bulkActions`, `onRowClick`, `minWidth`, and `density`. When `density` is omitted it
reads the store, which is how the Appearance setting reaches every table. Every list screen uses
it, so sorting, pagination, selection, and empty states behave the same everywhere.

**`RecordHeader`** defines the entity detail anatomy: breadcrumb, avatar, title, identifier,
status chips, a fact grid, actions, and tabs. Tabs are links carrying `?tab=`, not local state,
so a tab is shareable and survives reload. Learn the patient record and the doctor, lead,
appointment, campaign, complaint, and workflow records need no relearning.

`ParamDialog` binds a dialog to a URL search parameter. Any link to `/leads?create=1` opens the
new-lead form, which is why the command palette and row menus can trigger creation flows without
importing the dialogs.

---

## 7. Client-only boundaries

Two libraries generate DOM that differs between server and client render.

dnd-kit assigns `aria-describedby` ids from a module counter, so the server and the client
disagree on the number. xyflow measures the DOM on mount. Both produced hydration mismatches.

The lead board and workflow canvas load through `next/dynamic` with `ssr: false` and a skeleton
fallback. Reach for the same pattern for any library that measures layout or generates ids
during render.

---

## 8. Styling

Tailwind v4 with the token layer in `app/globals.css`. No `tailwind.config`.

Components reference semantic tokens (`bg-surface`, `text-ink-2`, `border-line`), never raw
colour values. Light and dark are tuned as separate value sets rather than derived from each
other, because a mechanical inversion put the navy rail within one step of the canvas.

The type scale lives as `@utility` classes (`text-h1`, `text-body-sm`, `text-label`,
`text-ident`) at fixed rem sizes. `lib/utils.ts` registers these with `tailwind-merge` as a
font-size group. Without that registration `cn("text-h1", "text-ink")` silently dropped the size.

Motion runs 150 to 250ms and only conveys state. Nothing animates on page load, and
`prefers-reduced-motion` collapses every duration.

---

## 9. Accessibility

Status never depends on colour alone. `StatusChip` renders an icon, a label, and a tone, which
keeps meaning intact in greyscale and for colour-blind users.

Tables mark sortable headers with `aria-sort`. Tabs and saved-view switchers carry `role="tab"`
with `aria-selected`. Icon-only buttons carry `aria-label`. Focus outlines use `:focus-visible`
at 2px against the ring token.

Avatars render initials rather than photographs. Stock portraits standing in for patients would
be fake medical imagery, and real ones would be the exact data this product exists to protect.

---

## 10. Verification

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # next build
npm run dev         # localhost:3000
```

One standing lint warning is deliberate: the React Compiler skips memoizing `useReactTable`
because TanStack returns functions it cannot safely memoize. Suppressing it would disable a rule
that catches real problems elsewhere.

Playwright covers what static analysis cannot: drag between board columns, the reveal-to-audit
loop, dialog open and close through the URL, and density propagation across navigation.

---

## 11. Known constraints

State lives in memory. A reload resets revealed values, created records, and preferences. Adding
`zustand/middleware` persistence would fix it, and was left out because a demo that resets
cleanly demonstrates better.

Filtering runs client-side over arrays in the hundreds. A real deployment moves it server-side
before the patient table reaches five figures.

The AI console returns a canned answer. It shows the surface, not a model integration.
