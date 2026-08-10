# Phase 11 — Verification

Not a phase. The checks run at the end of each of the others, and this document holds the ones
that span phases.

There are no tests in the repository today. `docs/ARCHITECTURE.md` §10 describes intended
Playwright coverage — drag between board columns, the reveal-to-audit loop, dialogs through the
URL, density across navigation. This is where that stops being intended.

---

## 1. What gets tested, and what does not

Testing everything is how a migration stops. Four categories earn tests; the rest do not.

| Category | Why |
|---|---|
| **Security properties** | The product's reason to exist. A regression here is not a bug, it is a breach |
| **Data integrity** | Seeding, migrations, the re-anchor job. Silent corruption is the worst failure mode |
| **The five interactions that already broke once** | Drag, reveal, URL dialogs, density, hydration |
| **Anything with a number in it** | Row counts under RLS, funnel aggregates, reveal budgets |

Not tested: component rendering, styling, copy, layout. The visual baseline in §5 covers those
more cheaply than assertions would.

---

## 2. Security assertions

These run in CI and are the ones that must never go amber.

### 2.1 Masking

```
GET /api/v1/patients            → body contains no seed phone number
GET /api/v1/patients/PT-102938  → body contains no seed phone number
Server-rendered /patients HTML  → contains no seed phone number
RSC payload for /patients       → contains no seed phone number
```

The last one is the subtle one. A Server Component that fetches a full row and passes it to a
Client Component ships the value in the flight payload even if it never renders. Grepping the
payload is what catches that, and nothing else does.

Implemented as a literal search for the 24 seed phone numbers and email addresses across every
response body. Crude, and it cannot be argued with.

### 2.2 Reveal

| Assertion |
|---|
| A reveal returns a value and writes exactly one audit entry |
| Forcing the audit insert to fail returns no value and leaves no audit entry |
| A reveal by Marketing is refused |
| A reveal by a Nurse against another department returns 404, not 403 |
| The 101st reveal in an hour returns 429 |
| The 60th reveal in an hour alerts without blocking |
| Exporting 30 rows with contact columns consumes 30 of the budget |
| An API token cannot reveal, whatever role it inherits |

The second is the important one and needs fault injection — a test-only flag that makes
`writeAudit` throw. Without it, the atomicity claim is untested and therefore a hope.

### 2.3 Row-level security

Exact counts, per Phase 03 §5.3. The seed makes them knowable.

```
Hospital Admin      → patients: 24
Nurse, pediatrics   → patients: <n>,  cardiology patients: 0
Doctor, cardiology  → appointments: <n>, other departments: 0
any role            → another user's notifications: 0
careflow_app        → UPDATE audit_log: permission denied
careflow_app        → DELETE audit_log: permission denied
query outside withSession → throws
```

Fill `<n>` from the seed when it runs. Hard-coding them is the point — a policy change that moves
a count fails the build and asks a person whether it should have.

### 2.4 Authentication

| Assertion |
|---|
| Every `(app)` route redirects to `/login` when signed out |
| A session without TOTP cannot reach `(app)` |
| An unknown address and a wrong password are indistinguishable in body and in timing |
| 31 minutes idle forces re-authentication |
| An invitation token works once |
| An expired invitation is refused |
| A recovery code works once |
| Password reset invalidates other sessions |

---

## 3. Data integrity

| Assertion |
|---|
| The seed loads every record in `lib/data/`; counts match audit §1.2 exactly |
| Re-running the seed changes nothing |
| One appointment renders `09:30` in Asia/Manila, not `01:30` — the eight-hour trap |
| Every referral either resolves to a patient or keeps `patient_name_raw` |
| Money round-trips as integer centavos with no float anywhere |
| `demo.reanchor` twice in succession produces identical state |
| `demo.reanchor` does not modify a patient created through the UI |
| Every migration applies to a branch restored from production |
| A double booking is rejected by the database, not by the UI |

The timezone one is worth a dedicated test forever. It is the failure that looks fine in
development, where the machine is often in the same zone, and is wrong by a working day in
production.

---

## 4. End-to-end

Playwright, headless, against a preview deployment with a seeded database.

The five from `docs/ARCHITECTURE.md` §10, which are the interactions that have already proven
fragile:

1. Drag a lead between board columns; the stage persists across a reload
2. Reveal a contact detail; the entry appears on `/admin/audit`
3. Open a dialog through `?create=1` from the command palette; close it; the URL is clean
4. Change density in Settings; every table on every screen reflects it after navigation
5. Load the lead board and the workflow canvas; the console shows no hydration warning

Plus a smoke pass: sign in, visit all 34 `(app)` routes, assert each renders its primary region
and logs no console error. That single test catches most of what Phase 06 can break, for the cost
of one file.

---

## 5. Visual baseline

Capture **before** Phase 06 begins. There is no way to reconstruct it afterwards.

```
npm run baseline    # screenshots all 37 routes, light and dark, two viewports
```

148 images, committed. After each migrated route, diff. Phase 06 is a data-plumbing change; a
visual difference means something went wrong, and the diff is the cheapest thing that says so.

Expected differences, allowlisted rather than ignored: loading skeletons now appear, and empty
states change where a filter moved server-side.

---

## 6. Per-phase gates

Each phase's own `Done when` list is its gate. This table names the one check per phase that, if
skipped, makes the rest of that phase unverifiable.

| Phase | The check that matters most |
|---|---|
| 01 Foundation | Seed counts match the audit exactly |
| 02 Authentication | Signed-out access to `/admin/audit` redirects |
| 03 Authorisation | Exact row counts per role, all nine |
| 04 Service layer | Failed audit insert returns no value |
| 05 HTTP API | No list response contains an unmasked contact value |
| 06 Screen migration | Visual diff clean against the baseline |
| 07 Jobs | Every handler idempotent under a double run |
| 08 Hardening | Charts render with `style-src-elem 'self'` |
| 09 Observability | Reveal logged without its value |
| 10 Deployment | Restore rehearsed, duration recorded |

---

## 7. What is deliberately not verified

Stated so nobody assumes coverage that does not exist.

- **Load and performance.** At 24 patients it measures nothing. Worth doing when the dataset is
  real, not before.
- **Accessibility.** `docs/ARCHITECTURE.md` §9 makes claims that were never verified against a
  screen reader or an automated checker. That remains true after this work. It deserves its own
  piece of work and does not belong inside a backend migration.
- **Penetration testing.** Out of scope for fictional data, per the first decision in the
  programme.
- **Browser matrix.** Next 16 sets the floor at Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+.
  Nothing here tests below it.
