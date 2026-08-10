# Current state audit

Taken 10 August 2026 against `main` at `390913c`, deployed to
`crm-dashboard-beta-ebon.vercel.app`.

The build is healthy. What follows is not a list of defects — it is the inventory the migration
is measured against, plus the handful of things that are genuinely wrong.

---

## 1. Inventory

### 1.1 Volume

| Measure | Count |
|---|---|
| TypeScript and TSX under `app/`, `components/`, `lib/` | 20,782 lines |
| Page routes | 37 |
| `.tsx` files | 104 |
| Files carrying `"use client"` | 81 |
| **Server Components among page files** | **0** |
| Seed data and helpers in `lib/data/` | 4,903 lines across 10 modules |
| Files importing from `lib/data` | 41, across 92 import statements |

### 1.2 Records held in the bundle

| Module | Holds | Count |
|---|---|---|
| `constants.ts` | Departments, hospital profile, current user, demo clock | 6 departments |
| `people.ts` | Doctors, staff, patients | 10 / 12 / 24 |
| `scheduling.ts` | Appointments | 33 |
| `work.ts` | Follow-ups, tasks | 20 / 14 |
| `pipeline.ts` | Leads | 14 |
| `patient-record.ts` | Conversations, referrals, feedback, documents, notes | 5 / 7 / 7 / 8 / 6 |
| `experience.ts` | Complaints | 8 |
| `marketing.ts` | Campaigns, workflows, graphs, integrations | 7 / 7 / 10 |
| `analytics.ts` | KPIs, series, insights, alerts | 8 KPIs |
| `system.ts` | Notifications, seed audit trail | |

All of it survives the migration as seed input. None of it is deleted.

### 1.3 Build health

| Check | Result |
|---|---|
| `tsc --noEmit` | Clean, exit 0 |
| `eslint .` | 0 errors, 1 warning — the documented React Compiler skip on `useReactTable` |
| `npm audit` | 0 vulnerabilities |
| `next build` | Succeeds. 39 entries — the 37 page routes plus `_not-found` and `icon.svg`. 34 dynamic, 5 static |
| Tracked secrets | None. `git ls-files` shows no `.env`, no `.vercel`, no `.tsbuildinfo` |
| `console.*`, `TODO`, `FIXME` | None anywhere in `app/`, `components/`, `lib/` |

This is a well-kept codebase. The work ahead is addition, not repair.

---

## 2. What does not exist

Stated plainly, because each is a phase below.

| Layer | State |
|---|---|
| HTTP API | No `app/api` directory. No route handler anywhere |
| Database | None. No driver, no connection string, no ORM |
| Persistence | `lib/store.ts` is in-memory zustand. A reload discards every write |
| Authentication | `/login` calls `setTimeout(600)` then `router.push("/mfa")`. No credential is checked |
| Authorisation | The nine-role matrix at `/admin/roles` is a static array rendered as a table |
| Sessions | None. No cookie, no token, no expiry |
| Middleware / proxy | No `proxy.ts`, no `middleware.ts` |
| Environment config | No `.env` files. `.gitignore` is already prepared for them |
| Rate limiting | None |
| Background work | None |
| Tests | None checked in. `docs/ARCHITECTURE.md` §10 describes intended Playwright coverage |

### 2.1 The deployment is open

Everything above means the live URL serves `/admin/audit`, `/admin/users`, and every patient
record to anyone who types the path. That is correct for a demonstration holding invented data
and unacceptable the moment authentication is claimed to exist.

Phase 02 closes it. Until then, the deployment should not be described as secure.

---

## 3. Findings

Three things are genuinely wrong. The rest of this section is context the migration needs.

### 3.1 `new Date()` appears in render paths — contradicts a documented invariant

`docs/ARCHITECTURE.md` §5 states: *"The build therefore renders identically on any calendar day.
Nothing calls `Date.now()` during render."* Four call sites disagree.

| Location | Use | Severity |
|---|---|---|
| `components/patient/overview.tsx:35` | Filters appointments by `a.date >= new Date().toISOString().slice(0,10)` | **Real.** In a render path |
| `components/inbox/inbox-view.tsx:58` | Timestamps a newly composed message | Benign. Event handler, not render |
| `lib/store.ts:78`, `lib/store.ts:96` | Timestamps audit entries | Correct. Audit times should be real |

Only the first matters. It compares the wall clock against the frozen demo clock, so it happens
to be correct today — 10 August 2026 is `TODAY` — and silently wrong from tomorrow. It is also a
hydration hazard: the `(app)` segment is `force-dynamic`, so client components still render once
on the server, and a date rollover between the two renders produces a mismatch.

Phase 01 removes the demo clock, which removes the contradiction. The line still needs replacing
with a value derived from the request, not from `new Date()` inside a component.

### 3.2 One `dangerouslySetInnerHTML` call site blocks a strict CSP

Two exist. Both are developer-authored and neither takes runtime input. Only one is a CSP problem,
and `docs/SECURITY.md` §3.5 already predicted it.

| Location | Content | CSP impact |
|---|---|---|
| `app/layout.tsx:57` | A hidden design-direction comment | **None.** CSP governs script and style execution; an HTML comment executes nothing |
| `components/ui/chart.tsx:95` | Per-chart colour custom properties in an inline `<style>` | **Blocking.** A `style-src` without `unsafe-inline` breaks every chart |

Phase 08 removes the `<style>` element entirely rather than granting it a nonce — the same
variables can be set as an inline style attribute on the container, which needs no exception that
an injected stylesheet could exploit.

### 3.3 Every page is a Client Component

Not a defect — it was the right shape for a bundle-backed demo. It is, however, the single
largest cost in this plan. 37 pages need splitting into a server shell and a client body before
any of them can read from a database without a round trip.

Phase 06 does that, mechanically, 37 times.

---

## 4. What the migration inherits, and should keep

Four properties of the current build are load-bearing. Losing any of them during the migration
would be a regression regardless of what else lands.

**Reveal is atomic with its audit write.** `lib/store.ts:62-84` performs both inside one `set()`.
There is no code path that unmasks without recording. The server implementation must preserve
this as one transaction, not two calls.

**No screen prints a raw phone number.** `Protected` mediates every contact detail. The migration
strengthens this — the server stops sending unrevealed values at all — but the component contract
stays: mask, click, unmask, badge.

**Exports log themselves.** An export is a bulk reveal and is recorded as one, naming the filter
and the row count.

**Enumerations are single-sourced.** Every string union in `lib/types.ts` has a matching registry
in `lib/status.ts`. Adding a value without adding its label, tone, and icon is a type error. The
database enums must be generated from or checked against these, or the two drift.

---

## 5. Interfaces the migration must not break

These are the seams the rest of the plan depends on. Each is used by many screens, so a change
propagates.

| Interface | Where | Used by |
|---|---|---|
| `DataTable` | `components/data/data-table.tsx` | Every list screen. Takes `columns`, `data`, `empty`, optional `toolbar`, `bulkActions`, `onRowClick`, `density` |
| `RecordHeader` | `components/record/record-header.tsx` | Every detail screen. Tabs are `?tab=` links, not state |
| `Protected` | `components/healthcare/protected.tsx` | Every contact detail. Currently reads and writes the local store |
| `ParamDialog` | `components/shared/create-dialog.tsx` | Every creation flow, bound to `?create=` / `?compose=` |
| `Spine` | `components/record/spine.tsx` | Patient, lead, and complaint timelines |
| `navigation` | `lib/nav.ts` | The rail and the command palette both map over it |
| Skeletons | `components/data/skeletons.tsx` | Built for loading states. Currently render only on `/design-system` |
| `ErrorState` | `components/data/states.tsx` | Not-found on detail pages. Extends to network failure unchanged |

The last two matter more than they look. They were written for a migration that had not happened
yet, and Phase 06 is where they finally earn their place.

---

## 6. Risk register

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | 37-page split introduces prop-threading bugs at scale | High | Medium | Mechanical recipe, one route per commit, Playwright smoke per route |
| R2 | Unmasked PII reaches a Client Component through the RSC payload | High | Medium | DTOs only; the raw row type never leaves its service module. Enforced by `tsc` |
| R3 | Neon free tier cold start makes the app feel slow | Medium | High | One round trip per page by design. Connection pooling via the Neon serverless driver |
| R4 | GitHub Actions scheduled workflows are delayed under load, and disable after 60 days of repo inactivity | Medium | Medium | Vercel's one daily cron as a backstop; a health check that alerts when the queue stalls |
| R5 | RLS policies silently return empty sets instead of erroring | Medium | Medium | A policy test suite that asserts row counts per role, not just absence of errors |
| R6 | Database enums drift from the TypeScript unions in `lib/types.ts` | Medium | Medium | Generate enums from the unions; a CI check fails the build on divergence |
| R7 | The demo re-anchor job corrupts records a user created | High | Low | Only rows listed in `seed_anchor` are touched. User rows have no anchor |
| R8 | Better Auth's schema conflicts with the hand-authored `staff` table | Low | Medium | Keep them separate. `staff.user_id` references the auth user; auth owns its own tables |
| R9 | Scope grows during Phase 06 as screens reveal missing endpoints | Medium | High | The route checklist in 06 is fixed at 37. New endpoints are logged, not built inline |

---

## 7. What the audit did not cover

Stated so nobody assumes otherwise.

- No performance profiling. Lighthouse and Core Web Vitals were not measured.
- No accessibility audit beyond reading `docs/ARCHITECTURE.md` §9. The claims there were not
  verified against a screen reader or an automated checker.
- No visual regression baseline exists, so Phase 06 has nothing to diff screens against.
  [11-verification.md](11-verification.md) proposes capturing one before the migration starts.
- No load testing. At 24 patients it would measure nothing.
