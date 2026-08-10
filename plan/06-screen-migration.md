# Phase 06 — Screen migration

Thirty-seven routes, every one a Client Component, each reading arrays compiled into the bundle.
This phase splits each into a server shell that queries and a client body that renders.

Depends on Phase 04. Independent of Phases 05 and 07.

The largest phase by volume and the most mechanical. Six to eight sessions, almost all of it the
same five steps repeated.

---

## 1. The recipe

Applied to every route. Deviating from it is how a 37-page migration becomes a 37-page rewrite.

### Step 1 — Rename, preserving history

```
git mv app/(app)/patients/page.tsx app/(app)/patients/patients-client.tsx
```

`git mv` rather than create-and-delete, so `git log --follow` still works on a file that will be
the largest in the route.

### Step 2 — Accept props instead of importing data

The body does not change. Only its inputs.

```diff
  "use client";
- import { patients } from "@/lib/data/people";
- import { doctorById, staffName } from "@/lib/data/people";

- export default function PatientsPage() {
+ export function PatientsClient({ rows, doctors, total }: Props) {
```

Lookup helpers — `doctorById`, `staffName`, `departmentName` — become either a prop of resolved
values or a field already present on the DTO. Prefer the DTO: `patient.doctor.name` beats passing
a lookup table.

### Step 3 — Write the server shell

```tsx
// app/(app)/patients/page.tsx
import { requireSession } from "@/lib/server/auth/session";
import * as patients from "@/lib/server/services/patients";
import { patientFiltersSchema } from "@/lib/server/schemas/patients";
import { PatientsClient } from "./patients-client";

export default async function Page(props: PageProps<"/patients">) {
  const session = await requireSession();
  const filters = patientFiltersSchema.parse(await props.searchParams);
  const page = await patients.list(session, filters);

  return <PatientsClient rows={page.data} total={page.meta.total} />;
}
```

`await props.searchParams` — in Next 16 `params` and `searchParams` are Promises and synchronous
access is removed. `PageProps<"/patients">` comes from `npx next typegen`.

Shells are short. If one grows past about forty lines it is doing work that belongs in a service.

### Step 4 — Suspense and a skeleton

```tsx
<Suspense fallback={<PatientsSkeleton />}>
  <PatientsData filters={filters} />
</Suspense>
```

`components/data/skeletons.tsx` already contains these. They currently render only on
`/design-system`. This is the phase they were written for.

### Step 5 — An error boundary

```tsx
// app/(app)/patients/error.tsx
"use client";
export default function Error({ error, reset }) {
  return <ErrorState reference={error.digest} onRetry={reset} />;
}
```

`ErrorState` already handles not-found on every detail page and extends to network failure
unchanged.

---

## 2. Filters

Two kinds, handled differently.

**Server filters** go in the URL, are parsed by the shell, and reach the service. Anything that
changes which rows come back: `view`, `department`, `doctor`, `status`, `scope`, `q`, `page`.

**Client filters** stay in `useState` and operate on what the server already sent. Column
visibility, sort, selection, density.

Getting this backwards is the main way this phase produces a slow application. Sorting 24 rows in
the browser is right. Filtering 18,000 patients in the browser is not, and the code that does it
looks identical.

Only three collections get server-side pagination: `patients`, `appointments`, `audit`. Everything
else in this product is bounded by how many a hospital has — six departments, ten doctors, twelve
staff — and paginating them adds latency for nothing.

---

## 3. Mutations

Every write becomes a Server Action in `app/actions/`, one file per domain.

```ts
// app/actions/patients.ts
"use server";

export async function archivePatient(reference: string, reason: string) {
  const session = await requireSession();
  await patients.archive(session, reference, reason);
  updateTag("patients");
  updateTag(`patients:${reference}`);
}
```

`updateTag` rather than `revalidateTag` — it expires and refreshes within the same request, so the
row disappears from the list before the dialog closes. `revalidateTag` now requires a cache-life
profile as a second argument and shows stale content meanwhile, which is wrong for a form.

Actions validate with the same Zod schema the API route uses. One schema, two callers.

`useActionState` handles pending and error states in the client body. The existing forms already
track `pending` locally — that state moves rather than being added.

---

## 4. `Protected` changes shape

The one component whose contract genuinely changes, and it changes as little as possible.

```diff
  const revealed = useCareflow((s) => s.revealed[key]);
- const reveal = useCareflow((s) => s.reveal);

  async function handleReveal() {
-   reveal({ resource, resourceId, field });
+   const result = await revealAction(resource, resourceId, field);
+   setRevealed(key, result.value, result.expiresAt);
    toast(`${field} revealed`, { … });
  }
```

Props gain `revealable: boolean` from the DTO. When false, the component renders the mask with no
button — a Marketing user is not offered an action that would 403.

Everything else holds: mask, click, unmask, badge, toast linking to the audit log.

The `value` prop is no longer the real value. It is the masked string. The real one arrives from
the action and lives in the store until `expiresAt`.

---

## 5. Route checklist

Thirty-seven routes. `Lines` is today's page file. `Server data` names the service call the shell
makes.

### Auth — 3 routes, migrated in Phase 02

| Route | Lines | Note |
|---|---|---|
| `/login` | 141 | Phase 02 §8 |
| `/mfa` | 161 | Phase 02 §8 |
| `/forgot-password` | 109 | Phase 02 §8 |

### Command centre and analytics — 5

| Route | Lines | Server data |
|---|---|---|
| `/` | 249 | `analytics.kpis`, `appointments.today`, `followups.overdue`, `complaints.breaching`, `analytics.insights` |
| `/analytics` | 167 | `analytics.series`, `analytics.rollups` |
| `/reports` | 140 | `analytics.reports` |
| `/departments` | 164 | `departments.list` — from the rollup view, Phase 01 §4.7 |
| `/ai` | 154 | None. Canned response stays canned |

`/` makes five service calls. They run in parallel — `Promise.all`, not sequential awaits, or the
Command Centre becomes the slowest page in the product.

### Patients — 3

| Route | Lines | Server data |
|---|---|---|
| `/patients` | 532 | `patients.list` — paginated, filters from URL |
| `/patients/[id]` | 336 | `patients.byReference`, `patients.timeline` |
| `/patients/new` | 544 | Reference data only. Submits via `createPatient` action |

`/patients/new` is the largest file and needs the least data. It is a form; only the department
and doctor lists come from the server.

`/patients` is the reference implementation. Migrate it first and completely, then use it as the
pattern for the other thirty-three.

### Scheduling — 3

| Route | Lines | Server data |
|---|---|---|
| `/appointments` | 445 | `appointments.list` — scope, department, doctor, status |
| `/appointments/calendar` | 35 | `appointments.calendar` — date range |
| `/appointments/[id]` | 262 | `appointments.byReference` |

### Pipeline — 4

| Route | Lines | Server data |
|---|---|---|
| `/leads` | 320 | `leads.list`. Board drag calls `moveLeadStage` |
| `/leads/[id]` | 198 | `leads.byReference` |
| `/referrals` | 194 | `referrals.list` |
| `/follow-ups` | 298 | `followups.list` by view |

The lead board loads through `next/dynamic` with `ssr: false` — dnd-kit generates ids from a
module counter and mismatches on hydration. That stays. The shell fetches; the dynamic import is
inside the client body, unchanged.

### Work and communication — 3

| Route | Lines | Server data |
|---|---|---|
| `/tasks` | 249 | `tasks.list` |
| `/inbox` | 78 | `conversations.list`, `conversations.byReference` for the selected thread |
| `/staff` | 30 | `staff.list` |

`/inbox` at 78 lines delegates to `components/inbox/inbox-view.tsx`. The `new Date()` at
`inbox-view.tsx:58` is in an event handler, not render, and stays — but the timestamp should come
from the server response after the message is created, not be guessed locally.

### Experience — 3

| Route | Lines | Server data |
|---|---|---|
| `/complaints` | 257 | `complaints.list`. SLA state derived server-side |
| `/complaints/[id]` | 210 | `complaints.byReference` |
| `/feedback` | 195 | `feedback.list` |

### Marketing and automation — 5

| Route | Lines | Server data |
|---|---|---|
| `/campaigns` | 231 | `campaigns.list` with funnel aggregates |
| `/campaigns/[id]` | 180 | `campaigns.byReference`, `campaigns.performance` |
| `/automations` | 163 | `workflows.list` |
| `/automations/[id]` | 185 | `workflows.graph`, `workflows.runs` |
| `/integrations` | 102 | `integrations.list`. Gains API token management, Phase 05 §4 |

The workflow canvas also loads `ssr: false` — xyflow measures the DOM on mount. Same treatment as
the lead board.

### Directory — 2

| Route | Lines | Server data |
|---|---|---|
| `/doctors` | 137 | `doctors.list` |
| `/doctors/[id]` | 191 | `doctors.byReference`, `doctors.schedule` |

### Administration — 5

| Route | Lines | Server data |
|---|---|---|
| `/admin/audit` | 188 | `audit.query` — cursor paginated |
| `/admin/users` | 125 | `staff.list`. Gains the invite flow from Phase 02 §6.2 |
| `/admin/roles` | 101 | Imports the matrix from `lib/server/authz/matrix.ts` |
| `/admin/security` | 184 | `staff.mfaCoverage`, `audit.anomalies` |
| `/settings` | 188 | `preferences.get`. Writes through `updatePreferences` |

`/admin/security` currently shows a static MFA coverage figure. After Phase 02 it counts real
accounts, and the policy toggles it renders become real settings.

### Not migrated — 1

| Route | Lines | Reason |
|---|---|---|
| `/design-system` | 750 | A component showcase. Renders primitives against fixed props and touches no data. Stays a Client Component |

---

## 6. Order

1. `/patients` — end to end, including `Protected` and the reveal action. Everything else copies it
2. `/patients/[id]` — proves the detail pattern and the timeline
3. `/` — proves parallel service calls
4. `/admin/audit` — proves cursor pagination
5. `/appointments` — proves the conflict path
6. The remaining twenty-eight, in any order

The first four are the ones that can go wrong in an interesting way. After them the work is
repetition.

One route per commit. A 37-route branch that fails review is unreviewable.

---

## 7. What must not regress

Captured before the phase starts, checked after each route.

| Property | Check |
|---|---|
| No screen prints a raw contact value | Grep the rendered HTML for a seed phone number |
| Density propagates from Settings to every table | Navigate and observe |
| `?tab=` survives reload and is shareable | Reload a detail page on tab 3 |
| `?create=1` opens the right dialog from any link | Command palette and row menu |
| The lead board drags between columns | Playwright |
| The workflow canvas renders without hydration warnings | Console clean |
| Reveal writes an audit entry that appears on `/admin/audit` | End to end |
| Rail and command palette pick up routes from `lib/nav.ts` | Add a dummy entry, see it appear |

The visual baseline in [11-verification.md](11-verification.md) is captured before route one and
diffed after every route. A migration that changes how a screen looks has gone wrong, and the diff
is the only thing that says so cheaply.

---

## 8. Done when

- [ ] All 33 routes in this phase have a server shell and a client body — 37 total, less the 3
      auth routes handled in Phase 02 and `/design-system`, which is not migrated
- [ ] No file under `app/` imports from `lib/data/` — verified by lint rule
- [ ] `git log --follow` works on every renamed client body
- [ ] Every route has an `error.tsx` and a Suspense fallback
- [ ] Every skeleton in `components/data/skeletons.tsx` is used by at least one route
- [ ] Server filters live in the URL; client filters live in state; no filter does both
- [ ] `/` issues its service calls in parallel
- [ ] Every mutation goes through a Server Action, not a fetch from a client body
- [ ] `Protected` renders no button when `revealable` is false
- [ ] Visual diff against the pre-migration baseline shows no unintended change
- [ ] `/design-system` still renders every primitive
- [ ] `docs/ARCHITECTURE.md` §5 and §11 rewritten — data flow and the in-memory claim are both
      now false
