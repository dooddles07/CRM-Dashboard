# Phase 01 — Foundation

Postgres, Drizzle, the schema, migrations, and the seed that carries every record in `lib/data/`
into the database without losing one.

Blocks every other phase. Nothing else starts until the seed runs clean.

`docs/DATABASE.md` Part 2 already proposes a schema. This phase implements it, extends it to
cover the surfaces Part 2 omits, and replaces the demo clock.

---

## 1. Provisioning

### 1.1 Neon

One project, three branches.

| Branch | Purpose |
|---|---|
| `main` | Production. Bound to the Vercel production environment |
| `preview` | Parent for per-pull-request branches |
| `dev` | Local development |

Neon branches are copy-on-write, so a pull request branch costs storage only for what it changes.
That is what makes migration testing affordable on a free plan.

Check current free-tier storage and compute limits before committing — they change, and 24
patients will not approach them, but the audit log partitions will grow.

Connect through the Neon serverless driver rather than `node-postgres`. Serverless functions open
and discard connections constantly, and the pooled HTTP endpoint avoids exhausting Postgres
connection slots.

```
DATABASE_URL=postgresql://…@…-pooler.neon.tech/careflow?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://…@….neon.tech/careflow?sslmode=require
```

Migrations and the seed use the unpooled URL. Everything else uses the pooled one.

### 1.2 Database roles

Three, so the application never runs as owner.

```sql
CREATE ROLE careflow_owner  LOGIN PASSWORD '…';  -- migrations only
CREATE ROLE careflow_app    LOGIN PASSWORD '…';  -- the application
CREATE ROLE careflow_readonly LOGIN PASSWORD '…'; -- analytics, ad-hoc queries

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO careflow_app, careflow_readonly;
```

`careflow_app` must not hold `BYPASSRLS`. Phase 03 depends on that, and it is easy to grant by
accident when debugging.

### 1.3 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid, pgp_sym_encrypt
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram search on names
CREATE EXTENSION IF NOT EXISTS btree_gist; -- the appointment exclusion constraint
```

`btree_gist` is required by the no-double-booking constraint in §4.3. `pgcrypto` backs both UUID
generation and column encryption.

---

## 2. Drizzle

```
npm i drizzle-orm @neondatabase/serverless
npm i -D drizzle-kit
```

```ts
// drizzle.config.ts
export default {
  schema: "./lib/server/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
  strict: true,
  verbose: true,
};
```

Schema is split by domain rather than kept in one file, mirroring `lib/data/`:

```
lib/server/db/schema/
  enums.ts        every Postgres enum, generated from lib/types.ts
  org.ts          departments
  people.ts       patients, doctors, staff, tags, patient_tags
  auth.ts         Better Auth tables, auth_attempts, invitations
  scheduling.ts   appointments
  pipeline.ts     leads, lead_stage_history, referrals
  work.ts         follow_ups, tasks
  comms.ts        conversations, messages, outbound_messages, message_events
  experience.ts   complaints, feedback
  marketing.ts    campaigns, campaign_recipients, workflows, workflow_*
  system.ts       audit_log, notifications, user_preferences, integrations
  demo.ts         seed_anchor
  index.ts        re-exports everything
```

### 2.1 Enums are generated, not hand-typed

Risk R6 in the audit is that Postgres enums drift from the string unions in `lib/types.ts`.
Writing them twice guarantees it eventually.

`scripts/gen-enums.ts` reads the unions and emits `lib/server/db/schema/enums.ts`. CI runs it and
fails if the output differs from what is committed — the same shape as a formatter check.

```ts
// generated — do not edit
export const patientStatus = pgEnum("patient_status", [
  "active", "inactive", "new", "archived",
]);
```

One transformation is deliberate: TypeScript uses kebab-case (`in-consultation`), Postgres uses
snake_case (`in_consultation`). The generator applies it, and a single `toDbEnum` / `fromDbEnum`
pair in `lib/server/db/enum-map.ts` handles the boundary. Do not scatter that conversion.

---

## 3. Schema conventions

Carried forward from `docs/DATABASE.md` §2.1, restated because every table depends on them.

| Convention | Rule |
|---|---|
| Primary key | `UUID`, `gen_random_uuid()` |
| Business identifier | A separate `reference TEXT UNIQUE` column. `PT-102938` is what staff quote; the UUID is what foreign keys use |
| Timestamps | `TIMESTAMPTZ`, stored UTC, rendered Asia/Manila |
| Money | `BIGINT` centavos. No floating point in a currency column |
| Deletes | Soft. `archived_at TIMESTAMPTZ`, and every index is partial on `WHERE archived_at IS NULL` |
| Audit columns | `created_at`, `updated_at` on everything mutable, `updated_at` maintained by trigger |
| Contact details | Encrypted column plus an unencrypted masked fragment beside it |

### 3.1 Reference generation

References are not sequential integers dressed up. `PT-102938` must not let someone enumerate
patients by decrementing. A per-prefix sequence with a random offset, or a short random suffix on
a date prefix. Decide once in `lib/server/db/reference.ts` and never inline it.

---

## 4. Tables

`docs/DATABASE.md` §2.2 through §2.7 gives the SQL for departments, patients, tags, staff,
doctors, appointments, leads, lead stage history, follow-ups, complaints, and the partitioned
audit log. Implement those as written. What follows is what Part 2 does not cover.

### 4.1 Contact encryption

Applies to `patients`, `leads`, `staff`, `doctors`.

```sql
phone_encrypted   BYTEA,          -- pgp_sym_encrypt(value, key)
phone_last2       CHAR(2),        -- unencrypted, so lists render without decrypting
email_encrypted   BYTEA,
email_domain      TEXT,
address_encrypted BYTEA,
address_city      TEXT,
```

The key comes from `PII_ENCRYPTION_KEY` in the environment, never from a column and never from
the repository. Encryption and decryption happen in the service layer, not in the ORM, so there
is one place to change when a KMS replaces the environment variable.

This is not KMS-grade. An attacker holding both a database dump and the Vercel environment reads
everything. It is real defence against a dump alone, it costs nothing, and the call site does not
change when it is upgraded. Recorded as a deliberate limitation in
[12-decisions-and-risks.md](12-decisions-and-risks.md).

### 4.2 Work and communication

```sql
CREATE TABLE tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference    TEXT UNIQUE NOT NULL,
  title        TEXT NOT NULL,
  patient_id   UUID REFERENCES patients(id),     -- nullable: admin work has no patient
  category     TEXT NOT NULL,
  owner_id     UUID NOT NULL REFERENCES staff(id),
  priority     priority NOT NULL DEFAULT 'medium',
  due_date     DATE NOT NULL,
  status       task_status NOT NULL DEFAULT 'todo',
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       TEXT UNIQUE NOT NULL,
  patient_id      UUID NOT NULL REFERENCES patients(id),
  channel         channel NOT NULL,
  subject         TEXT NOT NULL,
  assigned_to     UUID REFERENCES staff(id),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       message_direction NOT NULL,
  channel         channel NOT NULL,
  body            TEXT NOT NULL,
  author_id       UUID REFERENCES staff(id),      -- null for inbound
  internal        BOOLEAN NOT NULL DEFAULT false,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at);
```

Unread state is per staff member, not a boolean on the conversation. Two people reading the same
thread must not clear each other's badge:

```sql
CREATE TABLE conversation_reads (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  staff_id        UUID REFERENCES staff(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, staff_id)
);
```

The current model has `Conversation.unread` as a single boolean. This is the one place the
schema deliberately diverges from `lib/types.ts`, because the seed model could not express
per-user state and the database can. The DTO still exposes `unread: boolean`, computed for the
calling user, so no screen changes.

`internal` is enforced server-side. An internal note must never enter a delivery queue — that
check lives in the message service, not in the client that sets the flag.

### 4.3 Appointments

Implement `docs/DATABASE.md` §2.4 including the exclusion constraint. Two receptionists booking
the same slot is a race the database wins and the UI cannot:

```sql
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, starts_at + (duration_minutes || ' minutes')::interval) WITH &&
  ) WHERE (status NOT IN ('cancelled','no_show'));
```

The violation surfaces as SQLSTATE `23P01`. The service layer maps it to HTTP 409 with
`code: "SLOT_CONFLICT"`, never to a 500.

### 4.4 Marketing and automation

```sql
CREATE TABLE campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  channel       channel NOT NULL,
  status        campaign_status NOT NULL DEFAULT 'draft',
  audience_query JSONB NOT NULL,        -- the filter, not a frozen list
  scheduled_for TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES staff(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_recipients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id),
  status       delivery_status NOT NULL DEFAULT 'queued',
  message_id   UUID REFERENCES outbound_messages(id),
  UNIQUE (campaign_id, patient_id)
);
```

Storing `audience_query` rather than a materialised recipient list means the funnel numbers on
`/campaigns` are counted from `campaign_recipients`, not stored as columns that can disagree with
reality. `sent`, `delivered`, `opened`, `clicked`, and `appointments` all become aggregates.

Workflows keep their graph:

```sql
CREATE TABLE workflows       (id, reference, name, description, status, trigger_kind,
                              trigger_config JSONB, created_by, created_at, updated_at);
CREATE TABLE workflow_nodes  (id, workflow_id, kind, label, config JSONB, position JSONB);
CREATE TABLE workflow_edges  (id, workflow_id, source_node_id, target_node_id, condition TEXT);
CREATE TABLE workflow_runs   (id, workflow_id, subject_type, subject_id, status,
                              started_at, finished_at, error TEXT);
CREATE TABLE workflow_run_steps (id, run_id, node_id, status, output JSONB, at);
```

`position JSONB` holds the xyflow coordinates. The canvas is the editor for real rows, not a
picture of them.

`runs30d`, `successRate`, and `nodeCount` on `WorkflowSummary` become aggregates over
`workflow_runs` and `workflow_nodes`.

### 4.5 Outbound messages

The single record of anything the system tries to send. Campaigns, reminders, and workflow
actions all produce rows here.

```sql
CREATE TABLE outbound_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel        channel NOT NULL,
  patient_id     UUID REFERENCES patients(id),
  to_encrypted   BYTEA NOT NULL,          -- the destination is PII too
  to_masked      TEXT NOT NULL,
  body           TEXT NOT NULL,
  source_kind    TEXT NOT NULL,           -- 'campaign' | 'reminder' | 'workflow' | 'manual'
  source_id      UUID,
  provider       TEXT NOT NULL,           -- 'sandbox' | 'twilio' | 'resend'
  provider_ref   TEXT,
  status         delivery_status NOT NULL DEFAULT 'queued',
  queued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ,
  failed_reason  TEXT
);

CREATE TABLE message_events (
  id         BIGSERIAL PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
  event      delivery_event NOT NULL,   -- queued|sent|delivered|opened|clicked|bounced|failed
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail     JSONB
);
```

Status on `outbound_messages` is the latest event, denormalised for querying. `message_events` is
the history, and it is what the campaign funnel counts.

### 4.6 System

```sql
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  category   notification_category NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  href       TEXT NOT NULL,
  tone       tone NOT NULL DEFAULT 'neutral',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_unread ON notifications(staff_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE user_preferences (
  staff_id      UUID PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  density       TEXT NOT NULL DEFAULT 'comfortable',
  theme         TEXT NOT NULL DEFAULT 'system',
  rail_collapsed BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  description   TEXT NOT NULL,
  status        integration_status NOT NULL DEFAULT 'disconnected',
  config        JSONB NOT NULL DEFAULT '{}',
  secret_encrypted BYTEA,               -- credentials never in plaintext
  last_sync_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Notifications become per-staff rows rather than a global list. The current model has one array
everyone shares, which cannot be right once there are real accounts.

### 4.7 Analytics are views, not tables

The eight KPIs, the chart series, and the department rollups on `/analytics`, `/reports`, and the
Command Center are all derivable. Store none of them.

```sql
CREATE VIEW kpi_daily AS SELECT …;
CREATE MATERIALIZED VIEW department_rollup AS SELECT …;
```

`department_rollup` refreshes on the nightly job. Everything else queries live. At this data
volume the distinction is academic; it stops being academic at five figures, and building it
right now costs nothing.

The `Department` type currently carries `patients`, `appointments`, `doctors`, `leads`,
`noShowRate`, `satisfaction`, and `growth` as stored numbers. All seven become columns of the
rollup view. The DTO shape does not change, so `/departments` does not change.

---

## 5. Migrations

```
npx drizzle-kit generate      # writes SQL to drizzle/
npx drizzle-kit migrate       # applies, unpooled URL, owner role
```

Rules, because the failure modes are expensive:

- Generated SQL is committed. Reviewed like code.
- `drizzle-kit push` is never run against `preview` or `main`. It is a development convenience
  that skips the migration history.
- Anything Drizzle cannot express — the exclusion constraint, RLS policies, partitions, revoked
  grants — goes in a hand-written migration under `drizzle/manual/`, applied in order alongside
  the generated ones.
- `drizzle-kit check` runs in CI and fails on drift between schema and migrations.

Audit log partitions need creating ahead of time. A quarterly job creates the next partition;
missing one makes every insert fail, which fails every write in the product. The check for "does
the next partition exist" belongs in the health endpoint, not in a person's memory.

---

## 6. Seeding

`scripts/seed.ts` reads `lib/data/` directly. Those modules keep exporting exactly what they
export today — this is why nothing is deleted.

### 6.1 Order

Three passes, because of the foreign keys:

1. `departments`, `staff`, `tags`, `integrations`
2. `doctors`, `patients` — then backfill `departments.head_id`
3. Everything dependent: appointments, leads, referrals, follow-ups, tasks, conversations,
   messages, feedback, complaints, documents, notes, campaigns, workflows, notifications

### 6.2 The two rewrites

Both are called out in `docs/DATABASE.md` §2.9 and neither can be skipped.

**Referrals join by name.** `Referral.patientName` is a string because a referral arrives before
the patient record exists. The seed resolves it against `patients.name`; unmatched referrals keep
`patient_id NULL` and a `patient_name_raw` column. That column stays in the schema permanently —
the situation it models is real, not a seeding artefact.

**Appointments split date and start.** `{ date: "2026-08-10", start: "09:30" }` becomes one
`starts_at TIMESTAMPTZ`. The naive parse lands eight hours off:

```ts
starts_at = fromZonedTime(`${date}T${start}:00`, "Asia/Manila")
```

Get this wrong and every appointment in the product is wrong by a working day.

### 6.3 Idempotency

The seed is safe to re-run. It upserts on `reference`, so a partial failure is recoverable
without a manual truncate. It refuses to run against a database whose `audit_log` is non-empty
unless `--force` is passed, because that is the signature of a database someone has actually
used.

---

## 7. Replacing the demo clock

`lib/data/constants.ts` fixes `TODAY = "2026-08-10"` and derives every seed date from it through
`day(offset)` and `at(offset, time)`. In a live product that has to go, or every "today" view is
wrong from the second day.

### 7.1 Seeding maps offsets onto the real calendar

At seed time, `day(-9)` becomes `installDate - 9 days`. The dataset looks exactly as authored,
anchored to whenever the seed ran instead of to August 2026.

### 7.2 The anchor table keeps it looking alive

Seeded once and never touched again, the dataset ages: within a month every appointment is in the
past and the Command Center is empty.

A nightly job re-anchors. Not by shifting rows forward — that accumulates drift — but by
recomputing them from the offset they were authored with:

```sql
CREATE TABLE seed_anchor (
  table_name  TEXT NOT NULL,
  row_id      UUID NOT NULL,
  day_offset  INT  NOT NULL,          -- -9, 0, +3 … exactly as written in lib/data
  time_of_day TIME,                   -- null for date-only rows
  PRIMARY KEY (table_name, row_id)
);
```

The job sets `starts_at = (current_date + day_offset) + time_of_day`, in Asia/Manila, for every
anchored row. Idempotent. Running it twice changes nothing. Running it after a week's gap
produces the same result as running it nightly.

Rows you create carry no anchor and are never touched. That is what protects real work from the
demo scaffolding — risk R7.

When the product carries real records, drop `seed_anchor` and delete the job. Nothing else
references it.

### 7.3 What stops using the demo clock

| Consumer | Change |
|---|---|
| `lib/data/constants.ts` `TODAY`, `day()`, `at()` | Keep. They are seed-authoring helpers now, used only by `scripts/seed.ts` |
| `lib/format.ts` relative dates | Take a reference date as an argument instead of reading `TODAY`. The server passes request time |
| `components/patient/overview.tsx:35` | Stop calling `new Date()`. Receive the cutoff as a prop from the server shell |
| Every screen filtering `scope === "today"` | Filter in the service against `current_date`, not in `useMemo` against `TODAY` |

---

## 8. Connection handling

One module, one export. Every consumer goes through it so that setting the RLS context in
Phase 03 has a single place to live.

```ts
// lib/server/db/index.ts
import { drizzle } from "drizzle-orm/neon-serverless";
export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

Serverless invocations must not hold connections between requests. The Neon HTTP driver does not,
which is the reason for choosing it over `node-postgres`.

Queries needing a transaction — every write, and every read that sets RLS context — go through
the helper introduced in Phase 03 rather than calling `db` directly.

---

## 9. Done when

- [ ] Neon project exists with `main`, `preview`, `dev` branches
- [ ] Three roles created; `careflow_app` verified to lack `BYPASSRLS`
- [ ] All three extensions installed
- [ ] Schema covers every entity in `lib/types.ts` plus the tables in §4
- [ ] `scripts/gen-enums.ts` runs; CI fails on drift
- [ ] Generated migrations committed; manual migrations applied in order
- [ ] Exclusion constraint rejects a double booking, verified by a test
- [ ] `scripts/seed.ts` loads every record from `lib/data/` — counts match §1.2 of the audit exactly
- [ ] Re-running the seed changes nothing
- [ ] Referral name resolution reports how many matched and how many did not
- [ ] One appointment spot-checked: `starts_at` renders as `09:30` in Asia/Manila, not `01:30`
- [ ] `seed_anchor` populated; the re-anchor job is idempotent across two consecutive runs
- [ ] Audit log partition for the current and next quarter both exist

Nothing in `lib/data/` has been deleted or edited.
