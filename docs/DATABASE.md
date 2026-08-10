# Data model

**No database backs this application.** Records live as typed arrays in `lib/data/`, compiled
into the bundle and read directly by screens.

Part 1 documents the model as it exists today. Part 2 proposes a PostgreSQL schema for a real
deployment. Nothing in part 2 is implemented.

---

# Part 1: as built

## 1.1 Where data lives

| Module | Holds | Records |
|---|---|---|
| `constants.ts` | Departments, hospital profile, current user, demo clock | 6 departments |
| `people.ts` | Doctors, staff, patients | 10 / 12 / 24 |
| `scheduling.ts` | Appointments | 33 |
| `work.ts` | Follow-ups, tasks | 20 / 14 |
| `pipeline.ts` | Leads | 14 |
| `patient-record.ts` | Conversations, referrals, feedback, documents, notes | 5 / 7 / 7 / 8 / 6 |
| `experience.ts` | Complaints | 8 |
| `marketing.ts` | Campaigns, workflows, workflow graphs, integrations | 7 / 7 / 10 |
| `analytics.ts` | KPIs, chart series, AI insights, alerts | 8 KPIs |
| `system.ts` | Notifications, seed audit trail | |

Every module exports lookup helpers beside its data. Screens use those instead of writing their
own `find`:

```ts
patientById(id)          doctorById(id)         staffById(id) / staffName(id)
appointmentsFor(id)      appointmentsOn(date)   leadById(id)
followUpsFor(id)         tasksFor(id)           complaintById(id)
conversationsFor(id)     feedbackFor(id)        campaignById(id)
```

## 1.2 The demo clock

`constants.ts` fixes `TODAY = "2026-08-10"`, a Monday. Every seed date derives from it:

```ts
day(-9)              // "2026-08-01"
at(0, "09:30")       // "2026-08-10T09:30:00"
```

The build renders identically on any calendar day, and screenshots taken months apart still
show the same week. Never introduce `new Date()` into seed data or into render.

## 1.3 Identifier scheme

| Prefix | Entity | Example |
|---|---|---|
| `PT-` | Patient | `PT-102938` |
| `dr-` | Doctor | `dr-001` |
| `u-` | Staff | `u-001` |
| `AP-` | Appointment | `AP-40871` |
| `LD-` | Lead | `LD-3401` |
| `RF-` | Referral | `RF-5501` |
| `FU-` | Follow-up | `FU-3301` |
| `CV-` | Conversation | `CV-901` |
| `FB-` | Feedback | `FB-7701` |
| `CS-` | Complaint case | `CS-9012` |
| `CMP-` | Campaign | `CMP-201` |
| `WF-` | Workflow | `WF-01` |
| `a-` | Audit entry | `a-01` |

Prefixes are load-bearing. Staff quote them to each other, and they appear in the audit log and
error references. Every list renders them in the `text-ident` mono face.

## 1.4 Entities

Full type definitions live in `lib/types.ts`. Summary:

**Patient** carries identity, contact details, `emergencyContact`, `preferredChannel`, the
assigned `departmentId` and `doctorId`, registration and visit dates, `status`, `tags`,
`insurance`, acquisition `source`, `satisfaction`, and `outstandingFollowUps`.

**Doctor** carries specialty, department, availability status, contact, and performance
(`appointmentsToday`, `patients`, `satisfaction`, `noShowRate`, `yearsExperience`, `languages`,
weekly `schedule`).

**Department** carries head, patient and appointment counts, doctor and lead counts,
`noShowRate`, `satisfaction`, `growth`, and floor.

**StaffMember** carries role, optional department, status, `lastActive`, and `mfaEnabled`.

**Appointment** carries patient, doctor, department, type, date, start, duration, location,
status, reason, notes, and reminder channel.

**Lead** carries contact, source, department, interest, stage, owner, priority, dates, value,
and the enquiry text.

**Referral** carries patient name, provider and provider type, department, status, owner,
outcome, and value.

**FollowUp** carries patient, type, owner, due date, priority, status, and note.

**Task** carries title, optional patient, category, owner, priority, due date, and status.

**Conversation** carries patient, channel, subject, unread flag, assignee, and an array of
**Message** (direction, channel, body, timestamp, author, and an `internal` flag that keeps
staff notes out of patient view).

**Feedback** carries patient, department, doctor, rating, category, comment, and status.

**Complaint** carries patient, department, subject, description, type, owner, priority, status,
`openedAt`, `slaDueAt`, and resolution.

**Campaign** carries type, channel, status, audience and size, then the funnel: sent, delivered,
opened, clicked, appointments.

**WorkflowSummary** carries status, trigger, 30-day runs, success rate, and node count.
`workflowGraphs` maps a workflow id to nodes and edges for the builder canvas.

**Integration** carries category, description, status, and last sync.

**AuditEntry** carries actor id and name, action, resource and resource id, field, previous and
new values, timestamp, IP, and device.

## 1.5 Enumerations

Every enumerated value is a string union in `lib/types.ts` with a matching registry in
`lib/status.ts` supplying its label, tone, and icon. Adding a value to a union without adding it
to the registry is a type error, which is the point.

| Union | Values |
|---|---|
| `PatientStatus` | active, inactive, new, archived |
| `AppointmentStatus` | requested, pending, confirmed, checked-in, in-consultation, completed, cancelled, rescheduled, no-show |
| `AppointmentType` | Consultation, Follow-up, Procedure, Screening, Vaccination, Teleconsult |
| `DoctorStatus` | available, in-consultation, off-duty, on-leave |
| `LeadStage` | new, contacted, qualified, booked, visited, converted |
| `LeadSource` | website, facebook, google, phone, walk-in, referral, partner, insurance |
| `ReferralStatus` | received, assigned, contacted, scheduled, visited, completed, declined |
| `FollowUpStatus` | pending, completed, overdue, scheduled |
| `TaskStatus` | todo, in-progress, blocked, done |
| `CaseStatus` | new, assigned, investigating, waiting, resolved, closed |
| `Priority` | low, medium, high, urgent |
| `Channel` | sms, email, whatsapp, call |
| `DepartmentId` | cardiology, pediatrics, internal-medicine, orthopedics, dermatology, general-medicine |
| `StaffRole` | Super Admin, Hospital Admin, Doctor, Nurse, Receptionist, Patient Relations, Marketing, Billing, Manager |
| `AuditAction` | viewed, revealed, created, updated, deleted, exported, signed-in |
| `Tone` | success, warning, danger, info, ai, neutral |

## 1.6 Relationships

```
Department 1─* Doctor
Department 1─* Patient
Doctor     1─* Patient          (assigned lead clinician)
Patient    1─* Appointment      *─1 Doctor
Patient    1─* FollowUp         *─1 StaffMember (owner)
Patient    1─* Conversation     1─* Message
Patient    1─* Feedback
Patient    1─* Complaint        *─1 StaffMember (owner)
Patient    1─* Task, Document, Note
Lead       *─1 StaffMember (owner), *─1 Department
Referral   *─1 StaffMember (owner)  → Patient by name, not id
StaffMember 1─* AuditEntry
```

Two joins are deliberately loose in the seed data. `Referral.patientName` links by name rather
than id, because a referral arrives before the patient record exists. `Task.patientId` is
nullable, since administrative work has no patient.

## 1.7 Mutable state

`lib/store.ts` holds what changes during a session:

| Slice | Written by |
|---|---|
| `patients` | Add patient, archive patient |
| `notifications` | Marking read |
| `auditLog` | Every reveal, plus explicit `logAudit` calls |
| `revealed` | `Protected` reveals, keyed `${resourceId}:${field}` |
| `railCollapsed`, `density`, `commandOpen`, `notificationsOpen` | UI |

Seed arrays are never mutated. The store copies `seedPatients` on init and works from that copy.

Reveals and audit writes happen in the same `set()` call, so a reveal cannot land without its
audit entry. State is in memory only and resets on reload.

---

# Part 2: proposed schema

Not implemented. This is the target for a real deployment.

## 2.1 Choices

PostgreSQL 16. Native enums matching the TypeScript unions, so both ends stay in step.
`TIMESTAMPTZ` throughout, stored UTC and rendered in Asia/Manila. `pgcrypto` for `gen_random_uuid()`.

Business identifiers stay as a separate human-readable column. `PT-102938` is what staff quote
on the phone; the UUID is what foreign keys use.

Deletes are soft. A patient record carries appointment history, notes, and an audit trail that
must outlive the row.

## 2.2 Reference tables

```sql
CREATE TYPE patient_status      AS ENUM ('active','inactive','new','archived');
CREATE TYPE appointment_status  AS ENUM ('requested','pending','confirmed','checked_in',
                                         'in_consultation','completed','cancelled',
                                         'rescheduled','no_show');
CREATE TYPE lead_stage          AS ENUM ('new','contacted','qualified','booked','visited','converted');
CREATE TYPE case_status         AS ENUM ('new','assigned','investigating','waiting','resolved','closed');
CREATE TYPE priority            AS ENUM ('low','medium','high','urgent');
CREATE TYPE channel             AS ENUM ('sms','email','whatsapp','call');
CREATE TYPE audit_action        AS ENUM ('viewed','revealed','created','updated','deleted',
                                         'exported','signed_in');

CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,          -- 'cardiology'
  name        TEXT NOT NULL,
  head_id     UUID REFERENCES doctors(id),
  floor       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 2.3 People

```sql
CREATE TABLE patients (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          TEXT UNIQUE NOT NULL,           -- 'PT-102938'
  name               TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  gender             TEXT NOT NULL,
  -- PII: encrypted at rest, never returned unless the reveal is authorised
  phone_encrypted    BYTEA NOT NULL,
  email_encrypted    BYTEA,
  address_encrypted  BYTEA,
  -- unencrypted fragments the list view needs for triage
  phone_last2        CHAR(2) NOT NULL,
  email_domain       TEXT,
  address_city       TEXT,
  emergency_contact  JSONB,
  preferred_channel  channel NOT NULL DEFAULT 'sms',
  department_id      UUID REFERENCES departments(id),
  doctor_id          UUID REFERENCES doctors(id),
  registered_at      DATE NOT NULL,
  last_visit         DATE,
  next_appointment   DATE,
  status             patient_status NOT NULL DEFAULT 'new',
  insurance          TEXT,
  source             TEXT NOT NULL,
  satisfaction       NUMERIC(2,1),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at        TIMESTAMPTZ
);

CREATE INDEX idx_patients_department ON patients(department_id) WHERE archived_at IS NULL;
CREATE INDEX idx_patients_doctor     ON patients(doctor_id)     WHERE archived_at IS NULL;
CREATE INDEX idx_patients_status     ON patients(status)        WHERE archived_at IS NULL;
CREATE INDEX idx_patients_name_trgm  ON patients USING gin (name gin_trgm_ops);
```

Storing masked fragments (`phone_last2`, `address_city`) beside the encrypted values lets the
list render its mask without decrypting a single row. Decryption happens only on an authorised
reveal.

Tags become a join table rather than an array, so renaming a tag is one update:

```sql
CREATE TABLE tags         (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), label TEXT UNIQUE NOT NULL);
CREATE TABLE patient_tags (patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
                           tag_id     UUID REFERENCES tags(id)     ON DELETE CASCADE,
                           PRIMARY KEY (patient_id, tag_id));
```

`staff` and `doctors` follow the same shape: UUID key, human reference, department FK,
encrypted contact columns, soft delete.

## 2.4 Scheduling

```sql
CREATE TABLE appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        TEXT UNIQUE NOT NULL,
  patient_id       UUID NOT NULL REFERENCES patients(id),
  doctor_id        UUID NOT NULL REFERENCES doctors(id),
  department_id    UUID NOT NULL REFERENCES departments(id),
  type             TEXT NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL,
  duration_minutes SMALLINT NOT NULL,
  location         TEXT,
  status           appointment_status NOT NULL DEFAULT 'requested',
  reason           TEXT,
  notes            TEXT,
  reminder_channel channel,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appt_starts  ON appointments(starts_at);
CREATE INDEX idx_appt_doctor  ON appointments(doctor_id, starts_at);
CREATE INDEX idx_appt_patient ON appointments(patient_id, starts_at DESC);
```

The seed model splits `date` and `start` because fixtures are easier to read that way. A real
schema uses one `TIMESTAMPTZ`, and the calendar derives both from it.

Double-booking is a database concern, not a UI one:

```sql
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, starts_at + (duration_minutes || ' minutes')::interval) WITH &&
  ) WHERE (status NOT IN ('cancelled','no_show'));
```

## 2.5 Pipeline and work

```sql
CREATE TABLE leads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference      TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  phone_encrypted BYTEA,
  email_encrypted BYTEA,
  source         TEXT NOT NULL,
  department_id  UUID REFERENCES departments(id),
  interest       TEXT,
  stage          lead_stage NOT NULL DEFAULT 'new',
  owner_id       UUID REFERENCES staff(id),
  priority       priority NOT NULL DEFAULT 'medium',
  value_cents    BIGINT NOT NULL DEFAULT 0,
  inquiry        TEXT,
  converted_patient_id UUID REFERENCES patients(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contact_at TIMESTAMPTZ,
  next_follow_up  DATE
);

CREATE TABLE lead_stage_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage lead_stage,
  to_stage   lead_stage NOT NULL,
  moved_by   UUID REFERENCES staff(id),
  moved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Money is `BIGINT` in centavos. Floating point has no place in a currency column.

`lead_stage_history` is what makes the funnel measurable. Without it the board shows where leads
are and never how long they took to get there.

Follow-ups and tasks map directly, with `status` derived rather than stored:

```sql
CREATE VIEW follow_ups_with_status AS
SELECT f.*,
  CASE WHEN f.completed_at IS NOT NULL THEN 'completed'
       WHEN f.due_date < CURRENT_DATE  THEN 'overdue'
       WHEN f.due_date = CURRENT_DATE  THEN 'pending'
       ELSE 'scheduled' END AS status
FROM follow_ups f;
```

Storing `overdue` would need a nightly job to keep it true. Deriving it cannot go stale.

## 2.6 Cases and SLA

```sql
CREATE TABLE complaints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     TEXT UNIQUE NOT NULL,
  patient_id    UUID NOT NULL REFERENCES patients(id),
  department_id UUID REFERENCES departments(id),
  subject       TEXT NOT NULL,
  description   TEXT NOT NULL,
  type          TEXT NOT NULL,
  owner_id      UUID REFERENCES staff(id),
  priority      priority NOT NULL DEFAULT 'medium',
  status        case_status NOT NULL DEFAULT 'new',
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_due_at    TIMESTAMPTZ NOT NULL,
  resolved_at   TIMESTAMPTZ,
  resolution    TEXT
);

CREATE INDEX idx_complaints_open_sla ON complaints(sla_due_at)
  WHERE status IN ('new','assigned','investigating','waiting');
```

The partial index matters. The SLA queue only ever asks about open cases, and closed ones
accumulate forever.

## 2.7 Audit

The table this product exists to protect:

```sql
CREATE TABLE audit_log (
  id             BIGSERIAL PRIMARY KEY,
  actor_id       UUID REFERENCES staff(id),  -- nullable: see below
  actor_name     TEXT NOT NULL,            -- denormalised: survives staff deletion
  action         audit_action NOT NULL,
  resource_type  TEXT NOT NULL,
  resource_id    TEXT NOT NULL,
  field          TEXT,
  previous_value TEXT,
  new_value      TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address     INET,
  user_agent     TEXT,
  session_id     UUID
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit_log_2026q3 PARTITION OF audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');

CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id, occurred_at DESC);
CREATE INDEX idx_audit_actor    ON audit_log(actor_id, occurred_at DESC);
```

Three constraints:

`actor_name` is denormalised on purpose. An audit entry must remain readable after the staff
record is deleted.

`actor_id` is nullable (`drizzle/manual/0006_audit_log_actor_nullable.sql`, added in Phase 02):
most audit entries have a real actor, but plan/02-authentication.md §5's lockout requires an entry
for every lock, including one against an email that never resolved to a `staff` row at all — a
probe of a dead or not-yet-provisioned address, which is exactly the reconnaissance activity a
hospital's security posture wants visibility into. `actor_id` is `NULL` for those; `actor_name`
still carries a human-readable description (the attempted email, or the triggering IP for an
IP-driven lock spread across several accounts) so the row stays readable the same way a
deleted-staff row does.

The table is append-only. No application role holds `UPDATE` or `DELETE`:

```sql
REVOKE UPDATE, DELETE ON audit_log FROM app_user;
GRANT  INSERT, SELECT  ON audit_log TO   app_user;
```

Quarterly partitions keep retention manageable. Health-record access logs commonly need six or
more years, and dropping a partition beats deleting a billion rows.

## 2.8 Row-level security

The permission matrix at `/admin/roles` becomes RLS policies rather than UI-only filtering:

```sql
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_dept_scope ON patients
  FOR SELECT
  USING (
    current_setting('app.role') IN ('Super Admin','Hospital Admin')
    OR department_id::text = current_setting('app.department_id', true)
  );
```

A nurse in Pediatrics querying the patients table gets Pediatrics rows, whether the request came
from the UI or from a compromised token.

## 2.9 Migration notes

Seeding from the current fixtures needs three passes: departments and staff first, then doctors
and patients, then dependent records.

Two rewrites cannot be skipped. `Referral.patientName` needs resolving to `patient_id`, with
unmatched referrals kept as pending. Appointment `date` plus `start` needs collapsing into one
`starts_at` in Asia/Manila before conversion to UTC, since a naive parse lands eight hours off.
