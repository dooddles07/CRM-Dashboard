# Changelog

All notable changes to CareFlow CRM.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every record in this repository is fictional demonstration data. No real patient information
exists here.

---

## [0.4.0] - 2026-08-10

Completed the product surface. Every destination in the navigation rail now resolves to a
working screen, and the four primary entities gained detail records.

### Added

**Scheduling**

- `/appointments` list with today/upcoming/past scopes, department and status filters, bulk
  reminder sending, and a booking dialog driven by `?create=1`.
- `/appointments/calendar` week grid. Blocks sit on a 07:00 to 19:00 track, coloured by status,
  and open the appointment when clicked.
- `/appointments/[id]` detail with visit facts, patient panel, the patient's full timeline, and
  their other visits.

**Pipeline**

- `/leads` with two views. The board arranges leads across six stages and moves them by drag,
  recalculating column totals. The table view adds search and owner filtering.
- `/leads/[id]` detail carrying the enquiry text, source, value, and a derived activity spine.
- `/referrals` list covering provider, type, status, owner, and referral value.
- `/follow-ups` with saved views for overdue, due today, upcoming, and completed. Overdue rows
  render in danger tone.
- `/tasks` filtered by category, status, and owner, with bulk completion.

**Engagement**

- `/inbox` two-pane reader. Conversation list on the left, thread on the right, composer that
  distinguishes patient replies from internal notes.
- `/campaigns` list with delivery funnel metrics.
- `/campaigns/[id]` performance report showing sent through to appointments booked, plus
  per-stage conversion rates.

**Experience**

- `/feedback` with rating stars, sentiment and category filters, and the six-month trend.
- `/complaints` case list sorted by SLA due time. Breached cases surface in a banner.
- `/complaints/[id]` case view with details, activity, and resolution tabs.

**Operations**

- `/doctors` card grid showing status, load, satisfaction, and no-show risk.
- `/doctors/[id]` profile with weekly schedule, assigned patients, and performance.
- `/departments` metric cards, distribution donut, and a comparison table.
- `/staff` directory built on a shared table that also serves the admin view.

**Insights**

- `/analytics` full metric surface with all six chart types and department breakdowns.
- `/reports` catalogue of six standard reports plus a builder for range and format.
- `/ai` assistant console with proactive insight cards and a prompt surface.

**Automation**

- `/automations` workflow list with run counts and success rates.
- `/automations/[id]` visual builder canvas. Two workflows carry authored node graphs; the rest
  fall back to a generated linear sketch.
- `/integrations` catalogue grouped by category with connect toggles.

**Administration**

- `/admin/users` with role management and an invite dialog.
- `/admin/roles` permission matrix covering nine roles across seven areas.
- `/admin/audit` reading the live audit log, so reveals and exports performed elsewhere appear
  immediately.
- `/admin/security` showing MFA coverage, policy toggles, and recent sensitive activity.
- `/settings` with profile, notification, appearance, and hospital tabs.

**Data**

- `lib/data/pipeline.ts`: 14 leads spread across all six stages.
- `lib/data/experience.ts`: 8 complaints, several past their SLA.
- `lib/data/marketing.ts`: 7 campaigns, 7 workflows with node graphs, 10 integrations.

**Components**

- `components/shared/create-dialog.tsx`: `ParamDialog` binds dialog state to a URL search
  parameter, so `?create=1` and `?compose=1` links open the right flow from anywhere.
- `components/shared/staff-table.tsx`: one table serving both the staff directory and admin
  user management.
- `components/pipeline/lead-board.tsx`, `components/inbox/inbox-view.tsx`,
  `components/scheduling/appointment-calendar.tsx`, `components/automation/workflow-canvas.tsx`.

### Changed

- `DataTable` now reads density from the store when no prop is passed, so the Appearance setting
  reaches every table in the product.
- The `(app)` route group renders on demand. Every screen reads URL state or session state, so
  static prerendering never applied.

### Fixed

- Hydration mismatch on `/leads`. dnd-kit generates `aria-describedby` ids that differ between
  server and client. The board, and the xyflow canvas alongside it, now load client-side only.
- Production build failure. `useSearchParams` inside the create dialogs blocked static
  prerendering of `/inbox`. Marking the segment dynamic resolved it for every route at once.
- Invalid JSX on the complaint detail header, where a computed member expression was used as a
  tag name.

### Verification

`tsc --noEmit` clean. `eslint` reports zero errors. `next build` succeeds across 37 routes. All
routes return 200 from the dev server with no console errors.

Playwright confirmed the interactions that static checks cannot reach: dragging a lead between
stages moves the card and recomputes both column totals, revealing a masked phone number writes
an audit entry that appears at the top of `/admin/audit`, the create dialog opens from the URL
and clears it on submit, and switching density in Settings changes row padding on `/patients`.

---

## [0.3.0] - Command Center and Patient 360

### Added

- `/` Command Center with a KPI strip, patient growth, today's appointments, AI insights,
  alerts, and task panels.
- `/patients` table with saved views, faceted filters, bulk actions, and masked contact details.
- `/patients/new` three-step creation flow.
- `/patients/[id]` record with nine tabs on the shared record anatomy.
- `lib/timeline.ts` deriving one chronology from appointments, follow-ups, messages, tasks,
  feedback, referrals, and notes.
- `DataTable`, `KpiCard`, `Sparkline`, and six chart components.
- `RecordHeader` and `Spine`.
- Seed data for scheduling, work, analytics, and the patient record.

### Changed

- Pinned `@tanstack/react-table` to v8. Version 9 ships a rewritten API, and absorbing an
  unstable dependency mid-build carried no upside.

### Fixed

- Masked phone numbers wrapped across four lines and destroyed row rhythm. `Protected` now sets
  `whitespace-nowrap`, and `DataTable` takes a `minWidth` so wide tables scroll.
- The Spine rendered without its connecting rule, which is the entire point of the metaphor.
  Markers sat outside the border and their ring masked it. Rebuilt the geometry twice.
- Roughly 340px of dead space on the dashboard where one panel ended above a taller neighbour.
  Split into two independently flowing columns.
- The donut legend truncated every department name in a third-width panel. Legend moved below
  the chart.
- Recharts dropped three of seven category ticks on the acquisition chart.

---

## [0.2.0] - Foundation

### Added

- `app/globals.css` semantic token layer, tuned separately for light and dark, with the type
  scale as `@utility` classes.
- `lib/types.ts` covering the full domain model.
- `lib/status.ts` with a registry per status set. Status always carries icon, label, and colour.
- `lib/format.ts` with PII masking, date formatting against a fixed demo clock, and number
  formatting.
- `lib/store.ts`, a zustand store holding patients, notifications, the audit log, reveal state,
  and UI preferences.
- App shell: collapsible navy rail across eight sections, top bar, command palette, notification
  drawer.
- `StatusChip`, `ToneDot`, `Protected`, `PersonAvatar`.
- Auth surfaces at `/login`, `/forgot-password`, `/mfa`.
- `/design-system` reference page.
- Seed data for departments, doctors, staff, patients, notifications, and the audit trail.

### Fixed

- `tailwind-merge` silently dropped the custom type scale. `cn("text-h1", "text-ink")` merged
  both classes into the text-colour group and kept only the colour, so every composed heading
  rendered at body size. Registering the custom utilities as a font-size group fixed it.
- Horizontal overflow at 375px caused by fixed-width skeleton cells inflating the grid track.
- The dark rail sat within one step of the canvas and stopped reading as its own surface.
- Destructive buttons failed contrast in dark mode. shadcn hardcodes `text-white`, which lands
  near 2.7:1 against the lighter dark-mode red.
- Address masking returned the last word of the street. It now keeps the city so staff can
  still triage.

---

## [0.1.0] - Initial commit

Empty repository.
