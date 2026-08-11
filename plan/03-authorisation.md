# Phase 03 — Authorisation

The nine-role matrix at `/admin/roles` becomes enforcement instead of a table. Enforced twice —
once in the application, once in Postgres — per `docs/SECURITY.md` §3.2.

Depends on Phase 02. Blocks Phase 04.

---

## 1. The matrix as it exists

`app/(app)/admin/roles/page.tsx` holds it as a static array: nine roles across seven areas, four
levels. It is transcribed here verbatim because it becomes the source of truth and must not be
retyped from memory.

|  | Patients | Appointments | Pipeline | Billing | Reports | Settings | Users |
|---|---|---|---|---|---|---|---|
| Super Admin | full | full | full | full | full | full | full |
| Hospital Admin | full | full | full | edit | full | edit | edit |
| Manager | edit | edit | full | view | full | none | view |
| Doctor | edit | edit | none | none | view | none | none |
| Nurse | edit | view | none | none | none | none | none |
| Receptionist | view | full | view | view | none | none | none |
| Patient Relations | edit | edit | full | none | view | none | none |
| Marketing | view | none | full | none | view | none | none |
| Billing | view | view | none | full | view | none | none |

`full` ⊃ `edit` ⊃ `view` ⊃ `none`. `full` adds destructive operations — archive, delete, bulk
action — on top of `edit`.

The screen keeps rendering this table. It stops holding the data, and imports it from
`lib/server/authz/matrix.ts` instead, so the page and the enforcement can never disagree.

### 1.1 Billing has no screen

The matrix names Billing as an area but no route serves it. Left as-is: the matrix is a policy
statement, and policy for a surface that does not exist yet is harmless. Any future billing route
inherits enforcement on day one.

---

## 2. Capabilities the matrix cannot express

Four levels across seven areas do not cover everything the product does. Three operations need
their own answer.

### 2.1 Reveal

Unmasking a patient's contact details is sharper than "view". Marketing holds `Patients: view` so
it can build campaign audiences, and letting that role unmask twenty-four phone numbers defeats
the control the product exists to demonstrate.

`reveal` is therefore a discrete capability, not derived from level.

| Role | Reveal | Reason |
|---|---|---|
| Super Admin | ✅ | Oversight, unscoped |
| Hospital Admin | ✅ | Oversight, unscoped |
| Manager | ✅ | Own department |
| Doctor | ✅ | Direct care, own department |
| Nurse | ✅ | Direct care, own department |
| Patient Relations | ✅ | The role exists to contact patients |
| Receptionist | ✅ | Inbound calls and check-in |
| **Marketing** | ❌ | Works on audience aggregates. Never needs an individual number |
| **Billing** | ❌ | Works on claims. Never needs an individual number |

Reveals are scoped by §4: Manager, Doctor, and Nurse to their own department, the rest across all
departments.

### 2.2 Export

An export is a bulk reveal, and `docs/SECURITY.md` §2.3 already treats it as one. It requires
`view` on the area **and** the `export` capability, held by Super Admin, Hospital Admin, Manager,
and Patient Relations.

Exports of contact detail columns require `reveal` as well, and each exported row writes to the
same reveal budget in §5. Otherwise the rate limit is trivially bypassed by exporting.

### 2.3 Audit access

Reading `/admin/audit` requires the `audit:read` capability — Super Admin and Hospital Admin only.
Nobody holds `audit:write` or `audit:delete`; the audit writer runs with a database grant, not a
role capability, and §6 revokes the statements entirely.

---

## 3. The policy module

```ts
// lib/server/authz/policy.ts
export type Area = "patients" | "appointments" | "pipeline" | "billing"
                 | "reports" | "settings" | "users";
export type Level = "none" | "view" | "edit" | "full";
export type Capability = "reveal" | "export" | "audit:read";

export function can(session: Session, area: Area, level: Level): boolean;
export function holds(session: Session, capability: Capability): boolean;
export function assert(session: Session, area: Area, level: Level): void;  // throws Forbidden
```

Three rules that make this hard to get wrong:

**Every service method takes `session` as its first argument, non-optional.** Forgetting the check
is possible; forgetting the argument is a compile error, and the argument is useless unless
checked, so review has one thing to look for.

**`assert` throws a typed `ForbiddenError`.** It carries the area, level, and role, which becomes
the `REVEAL_NOT_PERMITTED`-style error envelope in Phase 05 and a useful audit entry rather than a
generic 403.

**Denials are logged at `warn`.** A user repeatedly hitting the same 403 is either a UI bug
showing them a button they cannot use, or someone probing. Both are worth seeing.

### 3.1 The UI keeps hiding things

`docs/SECURITY.md` §3.2: *"UI hiding stays as a courtesy. A hidden button is not an access
control."*

`/me` returns the caller's permission set, and the rail, command palette, and row menus filter
against it. That prevents a Nurse being shown a Settings link that 403s. The server enforces
regardless, and nothing in the UI is trusted.

---

## 4. Department scoping

The matrix says what a role may do. It does not say to whom. A Nurse holds `Patients: edit` — over
their own department's patients, not all 24.

| Role | Scope |
|---|---|
| Super Admin, Hospital Admin | All departments |
| Manager | Own department |
| Doctor, Nurse | Own department |
| Patient Relations | All departments — the role coordinates across them |
| Receptionist | All departments — front desk sees everyone arriving |
| Marketing | All departments, aggregates only |
| Billing | All departments |

Scope is enforced in Postgres, not in a `WHERE` clause the application remembers to add. A
forgotten `WHERE` is a leak; a row-level security policy is not forgettable.

---

## 5. Row-level security

### 5.1 Session context

Every query runs inside a transaction that declares who is asking, before it reads anything.

```ts
// lib/server/db/session.ts
export async function withSession<T>(
  session: Session,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT set_config('app.staff_id',      ${session.staffId},     true),
             set_config('app.role',          ${session.role},        true),
             set_config('app.department_id', ${session.departmentId ?? ''}, true)
    `);
    return fn(tx);
  });
}
```

`set_config(..., true)` is transaction-local. It cannot leak into a pooled connection's next
occupant, which is the failure mode that makes naive `SET` dangerous on serverless.

Services never touch `db` directly. They receive `tx`. That is the mechanism — if a query can only
run inside `withSession`, it can only run with a role declared.

### 5.2 Policies

```sql
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;

CREATE POLICY patients_read ON patients FOR SELECT USING (
  current_setting('app.role', true) IN
    ('Super Admin','Hospital Admin','Patient Relations','Receptionist','Marketing','Billing')
  OR department_id::text = current_setting('app.department_id', true)
);

CREATE POLICY patients_write ON patients FOR UPDATE USING (
  current_setting('app.role', true) IN ('Super Admin','Hospital Admin','Patient Relations')
  OR (current_setting('app.role', true) IN ('Manager','Doctor','Nurse')
      AND department_id::text = current_setting('app.department_id', true))
);
```

`FORCE ROW LEVEL SECURITY` matters. Without it, the table owner bypasses policies, and it is easy
to end up connected as owner while debugging and conclude the policies work.

Equivalent policies cover `appointments`, `leads`, `follow_ups`, `tasks`, `conversations`,
`messages`, `complaints`, `feedback`, `referrals`, `patient_documents`, and `patient_notes`.

Three tables are handled differently:

| Table | Policy |
|---|---|
| `audit_log` | `SELECT` for `audit:read` holders only. `INSERT` for all. `UPDATE`/`DELETE` revoked from every role |
| `notifications` | `staff_id = current_setting('app.staff_id')`. Nobody reads another person's notifications |
| `departments`, `doctors`, `staff` | Readable by all authenticated roles. They are the directory |

### 5.3 The empty-set failure mode

Risk R5. A wrong policy does not error — it returns zero rows, and a screen showing an empty state
looks like a data problem rather than a permissions bug.

The mitigation is that policy tests assert counts, not absence of exceptions:

```
as Nurse/pediatrics    → patients: exactly 4      (not "no error")
as Nurse/pediatrics    → patients in cardiology:  0
as Hospital Admin      → patients: exactly 24
as Marketing           → reveal:   ForbiddenError
```

The expected numbers come from the seed, so they are known. Any policy change that moves one of
them fails CI.

---

## 6. Audit table grants

```sql
REVOKE UPDATE, DELETE ON audit_log FROM careflow_app, careflow_readonly;
GRANT  INSERT, SELECT ON audit_log TO careflow_app;
GRANT  SELECT          ON audit_log TO careflow_readonly;
```

Append-only enforced by the database rather than by code, per `docs/SECURITY.md` §3.4. An
application bug cannot delete an entry; neither can an attacker holding application credentials.

Hash chaining each entry to its predecessor is deferred — see
[12-decisions-and-risks.md](12-decisions-and-risks.md). Shipping entries to a separate system is
also deferred, and is the more valuable of the two.

---

## 7. Impersonation

Better Auth's admin plugin can impersonate. It is enabled, restricted to Super Admin, and:

- writes an audit entry on start and on end
- stamps every audit entry made during the session with the true actor as well as the impersonated
  one
- caps the session at 30 minutes
- cannot be used to reveal PII — `holds(session, "reveal")` returns false while impersonating,
  regardless of the impersonated role

Without those four, impersonation is a hole large enough to make the rest of this phase decorative.

---

## 8. Done when

Three states, because "written" and "verified" are not the same thing and no database was
available while this phase was built:

- **[x]** done and verified by something that ran
- **[~]** written, and verified only as far as it can be without a live database
- **[ ]** not done

<!-- -->

- [x] `/admin/roles` renders from `lib/server/authz/matrix.ts`, not a local array
- [~] A Nurse in Pediatrics reading `/patients` sees exactly the Pediatrics rows — the policy is
      written and `scripts/policy-tests.ts` asserts it, deriving the count from the seed fixtures.
      Note the plan's own worked example in §5.3 says 4; the seed has **3** patients in Pediatrics
- [~] The same Nurse requesting a Cardiology patient by reference gets 404, not 403 — RLS returns
      no row, which is the hard half. Turning "no row" into a 404 envelope is Phase 05's `handle`
- [x] Marketing attempting a reveal gets `REVEAL_NOT_PERMITTED`
- [x] Billing attempting a reveal gets `REVEAL_NOT_PERMITTED`
- [~] Receptionist can reveal — the capability check passes. "And the entry lands in the audit log"
      needs Phase 04's reveal transaction, which is what writes it
- [x] Exporting contact columns without `reveal` is refused
- [ ] Exported rows consume the reveal budget — Phase 04. `canExport` refuses what must never
      start; the budget is a transaction, not a predicate
- [~] `careflow_app` cannot `UPDATE` or `DELETE` from `audit_log`, verified by attempting it —
      `scripts/policy-tests.ts` attempts exactly that, against the parent *and* every partition.
      `drizzle/manual/0005_grants.sql` had revoked on the parent only, so `DELETE FROM
      audit_log_2026q3` worked; `0007` closes it
- [x] `FORCE ROW LEVEL SECURITY` is set on every patient-scoped table — asserted by
      `lib/server/authz/matrix.test.ts`, which fails if any table is `ENABLE`d without `FORCE`
- [~] The policy test suite asserts exact row counts for all nine roles — written; needs a seeded
      database and `npm run test:policies` to have run
- [~] A query issued outside `withSession` fails rather than returning unscoped rows — the
      `app_role()` accessor raises rather than returning NULL, so this is a real error and not an
      empty result. §5.1 was not enough on its own: a pooled connection that has already served one
      session reads the GUC back as `''`, not as unset
- [~] Impersonation writes start and end entries and cannot reveal — the reveal block is unit
      tested; the entries and the 30-minute cap need a live session to exercise
- [~] `/me` returns a permission set, and the rail hides what the caller lacks — the permission set
      is resolved and the rail, palette and mobile drawer filter against it. The HTTP `GET /me` is
      deliberately left to Phase 05, which owns `/api/v1` and its envelope; `permissionSet()` is
      the shape that route will serve

### Deliberately deferred, with reasons

- `outbound_messages`, `message_events`, `campaign_recipients` get no RLS. `outbound_messages`
  carries encrypted patient contact details, so this is the gap that matters. It cannot close
  yet: `lib/server/comms/sandbox.ts` writes there during password reset and invitation delivery,
  both unauthenticated, and Phase 07's queue workers will too. Closing it needs a declared service
  context, which belongs with Phase 07.
- The matrix has no area for Engagement or Experience. `conversations`, `messages`, `complaints`
  and `feedback` take the `patients` area, which withholds writes from Receptionist, Marketing and
  Billing. If Phase 06 finds a screen that needs one of those three to write there, widen it in
  `drizzle/manual/0007_row_level_security.sql` §4 deliberately.
- `staff.role` stayed TEXT with a CHECK constraint rather than becoming a `pgEnum`. Reasoning in
  that migration's §1.
