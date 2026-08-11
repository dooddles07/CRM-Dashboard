# Phase 04 — Service layer

One layer owns queries, authorisation, masking, and audit. Server Components, Server Actions, and
route handlers all call it and none of them reimplement it.

Depends on Phase 03. Blocks Phases 05, 06, and 07.

This is the phase where the product's central promise — a value cannot become visible without its
audit entry — stops being a client-side convention and becomes a database transaction.

---

## 1. Why a service layer rather than queries in pages

Three consumers need the same logic: a Server Component rendering `/patients`, a Server Action
archiving a patient, and `GET /api/v1/patients` answering an integration. Written three times, the
authorisation check is right in two of them.

The masking rule makes this sharper. `docs/SECURITY.md` §3.3 requires that the server never send a
value the caller has not revealed. Enforcing that at three call sites is a discipline. Enforcing it
in one module is a type.

---

## 2. Shape

```
lib/server/services/
  patients.ts      appointments.ts   leads.ts        referrals.ts
  followups.ts     tasks.ts          conversations.ts complaints.ts
  feedback.ts      campaigns.ts      workflows.ts     integrations.ts
  staff.ts         doctors.ts        departments.ts   analytics.ts
  notifications.ts audit.ts          reveal.ts        preferences.ts
```

Twenty modules. Each exports functions, DTO types, and nothing else.

```ts
// lib/server/services/patients.ts

type PatientRow = InferSelectModel<typeof patients>;   // NOT exported

export type PatientListDTO = {
  reference: string;
  name: string;
  initials: string;
  age: number;
  department: { id: string; name: string };
  doctor: { reference: string; name: string };
  status: PatientStatus;
  tags: string[];
  lastVisit: string | null;
  nextAppointment: string | null;
  outstandingFollowUps: number;
  phone: { masked: string; revealable: boolean };
  email: { masked: string; revealable: boolean };
};

export async function list(
  session: Session,
  filters: PatientFilters,
): Promise<Paginated<PatientListDTO>>;

export async function byReference(
  session: Session,
  reference: string,
): Promise<PatientDetailDTO>;

export async function create(session: Session, input: NewPatient): Promise<PatientDetailDTO>;
export async function update(session: Session, reference: string, patch: PatientPatch): Promise<PatientDetailDTO>;
export async function archive(session: Session, reference: string, reason: string): Promise<void>;
```

### 2.1 The rule that does the work

`PatientRow` is not exported. No function returns it. Therefore no Server Component can receive
one, therefore no Client Component can be handed an unmasked phone number.

This is risk R2 closed by the compiler rather than by review. It costs one line of discipline per
module — declare the row type locally — and it is the single most valuable convention in this
plan.

Two corollaries:

- No `select *` reaching a caller. Every query projects into a DTO explicitly.
- No `Partial<PatientRow>` escaping either. Patch types are declared separately, from Zod schemas.

### 2.2 Every function takes `session` first

Non-optional, first position, every function including reads. Phase 03 §3 explains why. It also
means a service function cannot be called from a script without deciding what identity the script
runs as, which is a question worth being forced to answer.

---

## 3. Masking

`lib/format.ts` already implements `mask()` for phone, email, address, and date of birth, and the
transformations are correct — they keep what staff need to triage and drop the rest.

The function moves conceptually, not physically: it stays where it is, and the *server* starts
calling it instead of the browser.

```ts
// lib/server/mask/serialize.ts
export function maskContact(row: PatientRow, session: Session) {
  return {
    phone: { masked: mask(row.phoneLast2, "phone"), revealable: holds(session, "reveal") },
    email: { masked: mask(row.emailDomain, "email"), revealable: holds(session, "reveal") },
  };
}
```

The masked form is built from the unencrypted fragments — `phone_last2`, `email_domain`,
`address_city` — so rendering a list of 24 patients decrypts nothing. That is the reason those
columns exist (Phase 01 §4.1).

`revealable` drives whether `Protected` renders a button or plain masked text. A Marketing user
sees the mask with no affordance, because the server told the client there is nothing to click.

---

## 4. Audit

### 4.1 The writer

```ts
// lib/server/audit/write.ts
export async function writeAudit(
  tx: Transaction,
  session: Session,
  entry: {
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    field?: string;
    previousValue?: string;
    newValue?: string;
  },
): Promise<void>;
```

It takes `tx`, not `db`. An audit entry that commits independently of the thing it records is
worse than none — it can describe a write that rolled back.

Actor, timestamp, IP, user agent, and session id come from `session`, never from a caller
argument. `docs/API.md` §1.3 states this and it survives the move to the server: *"a server
implementation must take them from the session rather than the request body."*

`actor_name` is denormalised into the row on purpose. An entry must stay readable after the staff
record is deleted.

### 4.2 What writes an entry

| Action | Trigger |
|---|---|
| `signed-in` | Successful authentication, including which factor |
| `viewed` | Opening a patient, lead, or complaint detail record |
| `revealed` | Every reveal, §5 |
| `created` | Every create |
| `updated` | Every update, with `field`, `previousValue`, `newValue` per changed field |
| `deleted` | Archive and restore |
| `exported` | Every export, naming the filter and the row count |

`updated` writes one entry per changed field, not one per request. `/admin/audit` renders before
and after values per field, and a single row holding a JSON diff cannot fill that table.

`viewed` on list screens is deliberately not recorded. Logging every page view of `/patients`
would bury the entries that matter under noise, and the list carries no unmasked data. Opening an
individual record is recorded.

---

## 5. Reveal

The endpoint the security model rests on, per `docs/API.md` §2.3.

```ts
// lib/server/services/reveal.ts
export async function reveal(
  session: Session,
  resource: "patient" | "lead" | "staff" | "doctor",
  reference: string,
  field: "phone" | "email" | "address" | "dateOfBirth",
  reason?: string,
): Promise<{ value: string; auditId: string; expiresAt: string }>;
```

Order inside one transaction, and the order is the point:

```
BEGIN
  1. SET LOCAL app.staff_id / app.role / app.department_id   -- RLS now active
  2. SELECT the row by reference                             -- 404 if RLS hides it
  3. holds(session, "reveal")                                -- 403 if not
  4. budget check (§5.1)                                     -- 429 if exceeded
  5. INSERT audit_log                                        -- must succeed
  6. SELECT pgp_sym_decrypt(phone_encrypted, key)            -- only now
COMMIT
```

Step 5 before step 6. If the audit insert fails, the transaction rolls back and no value is
returned. If the decryption fails, the audit entry rolls back too — which is correct, because
nothing was disclosed.

Step 2 before step 3 means an out-of-scope reveal returns 404 rather than 403. A 403 confirms the
record exists, which is itself a disclosure.

`expiresAt` is advisory. The server does not remember grants; it tells the client how long to hold
the value before dropping it from memory. Re-revealing writes a second audit entry, which is
correct — each disclosure is an event. The client caches for the session so it does not
re-request, matching today's idempotent behaviour without the server pretending a second
disclosure did not happen.

### 5.1 Budget

`docs/SECURITY.md` §3.3: *"200 reveals in an hour is a manual export."*

No Redis, no extra table. The audit log counts itself:

```sql
SELECT count(*) FROM audit_log
WHERE actor_id = $1 AND action = 'revealed' AND occurred_at > now() - interval '1 hour';
```

`idx_audit_actor` already covers it.

| Window | Limit | On exceed |
|---|---|---|
| 1 hour | 100 | 429 `REVEAL_RATE_EXCEEDED` |
| 24 hours | 500 | 429, plus a `security` notification to Hospital Admins |

Exported contact columns count against the same budget, one per row — otherwise the limit is
bypassed by clicking Export.

These are set to interrupt as little legitimate work as possible: a Patient Relations desk working
a call list should never meet them. That makes them a backstop rather than the primary control,
and it shifts the weight onto detection — Phase 09 §3 alerts a human at 60 an hour, well before
the block. The visible badge and the audit entry remain the deterrent, exactly as
`docs/SECURITY.md` §4 argues.

The trade is deliberate and worth naming: a determined insider can pull all 24 contact records in
one sitting without tripping the limit. They cannot do it without leaving 24 audit entries and
firing an alert at the 60th.

Limits are configuration, not constants in code, so they can be tightened from the first month's
audit data without a deployment.

---

## 6. Errors

One error type per failure mode, thrown by services and translated once at each boundary.

```ts
export class NotFoundError    extends ServiceError { code = "NOT_FOUND" }        // 404
export class ForbiddenError   extends ServiceError { code = "FORBIDDEN" }        // 403
export class ValidationError  extends ServiceError { code = "VALIDATION_FAILED" }// 422
export class ConflictError    extends ServiceError { code = "CONFLICT" }         // 409
export class RateLimitError   extends ServiceError { code = "RATE_EXCEEDED" }    // 429
```

Each carries a `reference` — a short opaque id — that goes into the log line and into the
`ErrorState` the user sees, so a staff member can quote it to support. `docs/API.md` §2.1
specifies the envelope; Phase 05 renders it.

`message` is written for the person reading it. The UI shows it directly, so
`"Your role cannot reveal contact details for patients outside your department"` is the string,
not `"Forbidden"`.

Postgres errors map at the service boundary, never above it:

| SQLSTATE | Becomes |
|---|---|
| `23P01` exclusion violation | `ConflictError("SLOT_CONFLICT")` |
| `23505` unique violation | `ConflictError("DUPLICATE_REFERENCE")` |
| `23503` foreign key | `ValidationError` |

An unmapped database error reaching the client as a 500 with a stack trace is a leak. Everything
unrecognised becomes a generic 500 with a reference, and the detail goes to the log.

---

## 7. Transactions

| Operation | Rule |
|---|---|
| Any read | `withSession` — needed for RLS context even when read-only |
| Any write | `withSession`, and the audit entry is inside it |
| Reveal | One transaction, ordered per §5 |
| Lead conversion | One transaction: create patient, link lead, write stage history, write two audit entries |
| Invitation acceptance | One transaction, per Phase 02 §6.2 |
| Campaign launch | Transaction creates the recipients; the sends are queued, not sent, inside it |

The last one matters. Enqueue inside the transaction, deliver outside it. A campaign that rolls
back must not have sent anything, and a provider call inside a transaction holds a database
connection open across a network round trip.

---

## 8. Cache invalidation

Next 16 changed this and the plan has to use the new API.

| Need | API |
|---|---|
| Read-your-writes after a Server Action | `updateTag(tag)` — expires and refreshes in the same request |
| Background staleness is acceptable | `revalidateTag(tag, profile)` — **two arguments now**, the single-argument form is a type error |
| Refresh the client router after an action | `refresh()` |

Tags are per-resource and per-record:

```
patients            patients:PT-102938
appointments        appointments:AP-40871
notifications:u-001
```

A Server Action that archives a patient calls `updateTag("patients")` and
`updateTag("patients:PT-102938")`. The list and the record both reflect it before the response
returns.

Most screens in this product are per-user and uncacheable, so tagging is thinner than it looks.
The `(app)` segment stays `force-dynamic` — now for a real reason rather than a hydration
workaround.

---

## 9. Service catalogue

What each module owns. Detail lives in `docs/API.md` Part 2, which Phase 05 implements; this is
the division of responsibility.

| Service | Owns | Notable |
|---|---|---|
| `patients` | CRUD, list, timeline, archive, restore | Timeline delegates to `lib/timeline.ts`, which keeps working unchanged over DTOs |
| `appointments` | CRUD, calendar, check-in, cancel, reschedule, availability | Conflict is the database's answer, not a pre-check |
| `leads` | CRUD, stage moves, conversion | Stage move writes `lead_stage_history` in the same transaction |
| `referrals` | CRUD, patient resolution | Handles the unresolved-name case from Phase 01 §6.2 |
| `followups` | List by view, complete | `status` reads from the derived view, never stored |
| `tasks` | CRUD | |
| `conversations` | Threads, messages, assignment, read state | `internal` enforced here — an internal note never reaches the queue |
| `complaints` | CRUD, SLA state | `status` and breach derived server-side, never from a client clock |
| `feedback` | List, review, action | |
| `campaigns` | CRUD, audience resolution, launch, pause, funnel | Funnel counted from `campaign_recipients`, never stored |
| `workflows` | Graph CRUD, run history | Canvas edits persist nodes and edges |
| `integrations` | Connect, disconnect, sync status | Credentials encrypted, never returned |
| `staff` | Directory, invite, role change, suspend | Role change writes audit with before and after |
| `doctors` | Directory, schedule, availability | |
| `departments` | Directory, rollups | Rollups from the view in Phase 01 §4.8 |
| `analytics` | KPIs, series, insights | Aggregates only. No PII in any return shape |
| `notifications` | List, mark read | Per staff member |
| `preferences` | Density, theme, rail | Replaces the UI slice of the zustand store |
| `audit` | Query, export | Read-only. No update or delete function exists |
| `reveal` | §5 | The only function in the codebase returning an unmasked value |

---

## 10. What happens to `lib/store.ts`

It shrinks rather than disappears. The store keeps what is genuinely client-side:

| Slice | Fate |
|---|---|
| `patients` | Removed. Server state |
| `notifications` | Removed. Server state |
| `auditLog` | Removed. Server state |
| `revealed` | **Kept.** Values revealed this session, held in memory, dropped at `expiresAt`. Never persisted |
| `commandOpen`, `notificationsOpen` | Kept. Pure UI |
| `railCollapsed`, `density` | Kept, and mirrored to `user_preferences` so they survive a device change |

`reveal()` and `logAudit()` leave the store. `Protected` calls a Server Action instead, and the
returned value goes into `revealed`.

The component contract does not change: mask, click, unmask, badge.

---

## 11. Done when

Marked as in Phase 03: **[x]** verified by something that ran, **[~]** written and partly
verified, **[ ]** not done.

- [x] No service module exports a Drizzle row type — `service-layer/no-exported-row-type`, an
      ESLint rule, catching both `InferSelectModel<typeof t>` and `typeof t.$inferSelect`
- [x] No DTO contains a bare `phone: string` or `email: string` — every one is a `MaskedField`
- [x] A list response for 24 patients decrypts zero rows — the projections never name an
      encrypted column, so there is nothing to decrypt. Confirmed by serialising a list DTO and
      finding no plaintext digits
- [x] `reveal` returns a value only after its audit entry is committed
- [x] Killing the audit insert makes `reveal` return nothing — fault-injected via the
      `actor_id` foreign key; no value returned **and** the audit count unchanged
- [x] An out-of-scope reveal returns 404, not 403
- [ ] 101 reveals in an hour produces a 429 on the 101st — the budget is implemented and counted
      off `audit_log`, but never exercised. Testing it means writing 100 real audit entries to an
      append-only table, which is why it was left; it wants a disposable database branch
- [ ] The 60th reveal in an hour fires a `security` notification without blocking — Phase 09
      owns anomaly alerting. `audit.revealCountFor` is the query it will use
- [ ] Exporting 30 rows with contact columns consumes 30 of the budget — no export service
      exists yet. `canExport` refuses what must never start; the budget charge belongs with the
      export itself
- [x] `updated` writes one audit entry per changed field — `writeFieldUpdates`
- [x] A double-booked appointment surfaces as 409 `SLOT_CONFLICT`, never a 500
- [x] Every service function's first parameter is `session`, checked by a lint rule
- [x] A query outside `withSession` throws — Phase 03's guarantee, re-confirmed here when a test
      harness queried `patients` bare and got `app.role is not set`
- [~] Lead conversion rolls back entirely if any step fails — one transaction over two tables
      with two audit entries, so it does. Not fault-injected the way `reveal` was
- [x] `revalidateTag` is never called with one argument — no call site names it; `lib/server/cache.ts`
      wraps it and always passes `"max"`
- [ ] `lib/store.ts` no longer holds `patients`, `notifications`, or `auditLog` — **blocked on
      Phase 06.** Seventeen screens still read those slices, so removing them now breaks the
      application. §10 describes the end state, which is only reachable once the screens read
      through these services instead. The services they need exist; the migration is Phase 06's
      job

### Services

Twenty modules, in eighteen files: `staff`, `doctors` and `departments` share `directory.ts`,
since all three are the org chart, all three are readable by every role, and splitting them would
put one function in each.

Built and verified live: patients, appointments, leads, followups, tasks, referrals,
conversations, complaints, feedback, directory (staff/doctors/departments), campaigns, workflows,
integrations, analytics, notifications, preferences, audit, reveal.

### What building it found

- **§3's masking snippet does not work.** It calls `mask(row.emailDomain, "email")`, but `mask()`
  takes a whole value and removes from it, while a fragment is what is *left* after removal.
  Given `"example.com"` it splits on `@`, finds no domain, and returns `ex••••••@••••••` — local
  part leaked, TLD lost. The server masks are built from fragments directly and disclose less than
  the client ones.
- **`leads` stores no mask fragments at all.** No `phone_last2`, no `email_domain`. Masking a lead
  by decrypting would defeat the reason the fragments exist, so a lead's contact renders as an
  unhinted mask and the projection selects `IS NOT NULL` rather than the column.
- **§2.1's "declare the row type locally" is dead code.** An unused local type is a lint error.
  The property that matters is the absence of the *export*, so the modules simply never name
  `InferSelectModel`.
- **§6's `ForbiddenError` collided with Phase 03's.** Phase 03's now extends `ServiceError`
  rather than there being two classes with one name.
- **§9's department rollup view was never built.** Phase 01 shipped without it, so the counts are
  computed live — which is better: they inherit row-level security, so a Pediatrics nurse sees 3
  patients there and 0 elsewhere, where a stored rollup would report hospital-wide totals to
  everyone.
