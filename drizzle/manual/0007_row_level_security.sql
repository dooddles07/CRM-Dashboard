-- plan/03-authorisation.md §5, §6. Row-level security, the session-context
-- accessors it reads, and the audit-log grants that make append-only a
-- database property rather than a code convention.
--
-- Run as careflow_owner, after every generated migration. Idempotent: every
-- statement is either CREATE OR REPLACE, DROP ... IF EXISTS followed by
-- CREATE, or an ALTER that is a no-op when already applied. Re-running is
-- safe and is the intended way to apply a policy change.
--
-- The application half of this lives in lib/server/authz/. The two must
-- agree; lib/server/authz/matrix.test.ts parses the role lists out of this
-- file and asserts they match lib/server/authz/matrix.ts, so a change made
-- in one place and not the other fails the test rather than silently
-- granting or withholding rows.


-- ---------------------------------------------------------------------------
-- 1. Role integrity
-- ---------------------------------------------------------------------------
-- plan/01-foundation.md left `staff.role` as TEXT with a note that Phase 03
-- would "decide whether it becomes an enum or a lookup table". Decision: it
-- stays TEXT with a CHECK constraint.
--
-- A pgEnum buys nothing here that the constraint does not. `current_setting`
-- returns text, so every policy below compares text either way; and Postgres
-- enums cannot drop a value, so retiring a role would need a full type
-- rebuild, whereas this constraint is one ALTER. What actually matters is
-- that a typo'd role can never land in the column: an unrecognised role
-- matches no policy branch, and the result is zero rows on every screen —
-- plan §5.3's empty-set failure, the exact thing that "looks like a data
-- problem rather than a permissions bug".

ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_known;
ALTER TABLE staff ADD CONSTRAINT staff_role_known CHECK (
  role IN (
    'Super Admin', 'Hospital Admin', 'Manager', 'Doctor', 'Nurse',
    'Receptionist', 'Patient Relations', 'Marketing', 'Billing'
  )
);

-- plan §4: Manager, Doctor, and Nurse are scoped to their own department. A
-- row in one of those roles with no department can be authorised for nothing
-- — see lib/server/db/session.ts's UnscopedSessionError, which is this same
-- invariant restated where it can name the staff member. The seeded staff
-- satisfy this already: the four rows with a NULL department are Hospital
-- Admin, Super Admin, Marketing, and Billing, all of which see every
-- department.
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_department_required;
ALTER TABLE staff ADD CONSTRAINT staff_department_required CHECK (
  role NOT IN ('Manager', 'Doctor', 'Nurse') OR department_id IS NOT NULL
);


-- ---------------------------------------------------------------------------
-- 2. Session context accessors
-- ---------------------------------------------------------------------------
-- lib/server/db/session.ts's withSession() sets app.staff_id, app.role and
-- app.department_id with set_config(..., true) — transaction-local, so they
-- cannot leak into a pooled connection's next occupant.
--
-- These raise instead of returning NULL when the context is missing, which
-- is what discharges plan §8's "A query issued outside `withSession` fails
-- rather than returning unscoped rows". Returning NULL would satisfy the
-- letter of it — a NULL comparison yields no rows — but "no rows" is
-- indistinguishable from an empty table, and plan §5.3 is explicit that
-- silently returning nothing is the failure mode to design against.
--
-- Relying on current_setting()'s own "unrecognized configuration parameter"
-- error would not be enough: once any transaction on a connection has set a
-- custom GUC, the placeholder persists on that connection and later
-- transactions read it back as an empty string rather than erroring. The
-- empty-string check below is what makes the guarantee hold on the second
-- request through a pooled connection, not just the first.
--
-- Every policy calls these as (SELECT app_role()) rather than app_role().
-- The scalar subquery makes the planner evaluate it once as an InitPlan
-- instead of once per row.

CREATE OR REPLACE FUNCTION app_role() RETURNS text
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog, public
AS $$
DECLARE v text;
BEGIN
  v := current_setting('app.role', true);
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'app.role is not set: this query ran outside withSession()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION app_staff_id() RETURNS uuid
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog, public
AS $$
DECLARE v text;
BEGIN
  v := current_setting('app.staff_id', true);
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'app.staff_id is not set: this query ran outside withSession()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v::uuid;
END;
$$;

-- Nullable by design, and the one accessor that does not raise on an empty
-- value: a NULL department is legitimate for the six roles that see every
-- department. withSession() refuses to open a transaction for a
-- department-scoped role without one, so "scoped role, no department" never
-- reaches here.
CREATE OR REPLACE FUNCTION app_department_id() RETURNS uuid
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog, public
AS $$
DECLARE v text;
BEGIN
  v := current_setting('app.department_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
END;
$$;

-- The non-raising variant, used only by audit_log (§6). Audit entries are
-- written by flows that have no session by nature — a failed sign-in, a
-- lockout against an email that never resolved to a staff row — so a policy
-- on that table must not raise merely because nobody is logged in.
CREATE OR REPLACE FUNCTION app_role_or_null() RETURNS text
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT nullif(current_setting('app.role', true), '')
$$;


-- ---------------------------------------------------------------------------
-- 3. Policy predicates derived from the matrix
-- ---------------------------------------------------------------------------
-- Each role list appears exactly once in this file. Twelve tables share
-- these predicates rather than restating the lists, so a policy change is
-- one edit and cannot half-apply.
--
-- Read policies carry department scope only, never the area/level matrix.
-- That is deliberate: a Nurse has `pipeline: none`, and if RLS enforced that
-- too, /tasks would render an empty list instead of returning 403. Area and
-- level are the application's half of the enforcement (lib/server/authz/policy.ts's
-- `assert`), which can produce a real error; RLS's half is "which rows".
--
-- Write policies do restate the matrix, per plan §5.2's own patients_write
-- example. That is defence in depth, and the reason matrix.test.ts checks
-- these lists against lib/server/authz/matrix.ts.

-- plan §4's "All departments" roles: Super Admin, Hospital Admin,
-- Receptionist, Patient Relations, Marketing, Billing. The complement —
-- Manager, Doctor, Nurse — is scoped to app_department_id().
CREATE OR REPLACE FUNCTION app_sees_all_departments() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT (SELECT app_role()) IN (
    'Super Admin', 'Hospital Admin', 'Receptionist',
    'Patient Relations', 'Marketing', 'Billing'
  )
$$;

-- Roles holding at least `edit` on patients: everyone except Receptionist,
-- Marketing and Billing, who hold `view`.
CREATE OR REPLACE FUNCTION app_can_edit_patients() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT (SELECT app_role()) IN (
    'Super Admin', 'Hospital Admin', 'Manager', 'Doctor', 'Nurse', 'Patient Relations'
  )
$$;

-- Roles holding at least `edit` on appointments. Receptionist holds `full`
-- here and Nurse only `view` — the one place those two swap.
CREATE OR REPLACE FUNCTION app_can_edit_appointments() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT (SELECT app_role()) IN (
    'Super Admin', 'Hospital Admin', 'Manager', 'Doctor',
    'Receptionist', 'Patient Relations'
  )
$$;

-- Roles holding at least `edit` on pipeline. Marketing holds `full`; Doctor,
-- Nurse and Billing hold nothing at all.
CREATE OR REPLACE FUNCTION app_can_edit_pipeline() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT (SELECT app_role()) IN (
    'Super Admin', 'Hospital Admin', 'Manager', 'Patient Relations', 'Marketing'
  )
$$;

-- plan §2.3: audit:read is Super Admin and Hospital Admin only.
CREATE OR REPLACE FUNCTION app_holds_audit_read() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT (SELECT app_role_or_null()) IN ('Super Admin', 'Hospital Admin')
$$;

-- Row scope for the tables that reach a department only through a patient.
-- The subquery is itself subject to the patients read policy — that is the
-- point: department scope is defined once, on patients, and every dependent
-- table inherits it without restating it. Postgres evaluates this as a
-- primary-key lookup per row; at this data volume that is free, and the
-- alternative (denormalising department_id onto eleven tables) is a
-- consistency problem, not an optimisation.
CREATE OR REPLACE FUNCTION app_sees_patient(patient uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM patients WHERE patients.id = patient)
$$;


-- ---------------------------------------------------------------------------
-- 4. Patient-scoped tables
-- ---------------------------------------------------------------------------
-- plan §5.2. FORCE, not just ENABLE: "Without it, the table owner bypasses
-- policies, and it is easy to end up connected as owner while debugging and
-- conclude the policies work." careflow_owner runs the migrations and the
-- policy tests connect as careflow_app, so without FORCE a test suite run
-- through the owner URL would pass unconditionally.
--
-- FORCE also applies to careflow_owner, which is what §7.5's explicit owner
-- policies exist to handle — read that section before concluding the owner
-- bypass is back. It is not implicit any more; it is declared, per table,
-- and grep-able.
--
-- Which area governs each table's writes:
--
--   patients, patient_notes, patient_documents, patient_tags  -> patients
--   appointments                                              -> appointments
--   leads, lead_stage_history, referrals, follow_ups, tasks    -> pipeline
--   conversations, messages, complaints, feedback              -> patients
--
-- The last row needs a word. The matrix has seven areas and none of them is
-- Engagement or Experience, so the inbox and the complaints/feedback tables
-- have no area of their own. They are entries in a patient's record, so they
-- take the patients area — which is the conservative reading: it withholds
-- writes from Receptionist, Marketing and Billing. If Phase 06 finds a
-- screen that legitimately needs one of those three to write there, widen it
-- here deliberately rather than discovering it as a 403 in production.

-- patients ------------------------------------------------------------------
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_read ON patients;
CREATE POLICY patients_read ON patients FOR SELECT USING (
  (SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id())
);

DROP POLICY IF EXISTS patients_write ON patients;
CREATE POLICY patients_write ON patients FOR ALL
  USING (
    (SELECT app_can_edit_patients())
    AND ((SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id()))
  )
  WITH CHECK (
    (SELECT app_can_edit_patients())
    AND ((SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id()))
  );

-- patient_notes -------------------------------------------------------------
ALTER TABLE patient_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_notes FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_notes_read ON patient_notes;
CREATE POLICY patient_notes_read ON patient_notes FOR SELECT
  USING (app_sees_patient(patient_id));

DROP POLICY IF EXISTS patient_notes_write ON patient_notes;
CREATE POLICY patient_notes_write ON patient_notes FOR ALL
  USING ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id))
  WITH CHECK ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id));

-- patient_documents ---------------------------------------------------------
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_documents FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_documents_read ON patient_documents;
CREATE POLICY patient_documents_read ON patient_documents FOR SELECT
  USING (app_sees_patient(patient_id));

DROP POLICY IF EXISTS patient_documents_write ON patient_documents;
CREATE POLICY patient_documents_write ON patient_documents FOR ALL
  USING ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id))
  WITH CHECK ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id));

-- patient_tags --------------------------------------------------------------
ALTER TABLE patient_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_tags FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_tags_read ON patient_tags;
CREATE POLICY patient_tags_read ON patient_tags FOR SELECT
  USING (app_sees_patient(patient_id));

DROP POLICY IF EXISTS patient_tags_write ON patient_tags;
CREATE POLICY patient_tags_write ON patient_tags FOR ALL
  USING ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id))
  WITH CHECK ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id));

-- appointments --------------------------------------------------------------
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_read ON appointments;
CREATE POLICY appointments_read ON appointments FOR SELECT USING (
  (SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id())
);

DROP POLICY IF EXISTS appointments_write ON appointments;
CREATE POLICY appointments_write ON appointments FOR ALL
  USING (
    (SELECT app_can_edit_appointments())
    AND ((SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id()))
  )
  WITH CHECK (
    (SELECT app_can_edit_appointments())
    AND ((SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id()))
  );

-- leads ---------------------------------------------------------------------
-- department_id is nullable here (a lead can arrive before anyone routes
-- it). A NULL department is invisible to Manager, Doctor and Nurse — strict
-- rather than permissive, since the alternative would make every unrouted
-- lead globally visible, and leads carry encrypted contact details.
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_read ON leads;
CREATE POLICY leads_read ON leads FOR SELECT USING (
  (SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id())
);

DROP POLICY IF EXISTS leads_write ON leads;
CREATE POLICY leads_write ON leads FOR ALL
  USING (
    (SELECT app_can_edit_pipeline())
    AND ((SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id()))
  )
  WITH CHECK (
    (SELECT app_can_edit_pipeline())
    AND ((SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id()))
  );

-- lead_stage_history --------------------------------------------------------
ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_history FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_stage_history_read ON lead_stage_history;
CREATE POLICY lead_stage_history_read ON lead_stage_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_stage_history.lead_id));

DROP POLICY IF EXISTS lead_stage_history_write ON lead_stage_history;
CREATE POLICY lead_stage_history_write ON lead_stage_history FOR ALL
  USING (
    (SELECT app_can_edit_pipeline())
    AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_stage_history.lead_id)
  )
  WITH CHECK (
    (SELECT app_can_edit_pipeline())
    AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_stage_history.lead_id)
  );

-- referrals -----------------------------------------------------------------
-- Scoped on its own department_id rather than through patient_id, which is
-- nullable by design: "a referral arrives before the patient record exists"
-- (lib/server/db/schema/pipeline.ts).
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referrals_read ON referrals;
CREATE POLICY referrals_read ON referrals FOR SELECT USING (
  (SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id())
);

DROP POLICY IF EXISTS referrals_write ON referrals;
CREATE POLICY referrals_write ON referrals FOR ALL
  USING (
    (SELECT app_can_edit_pipeline())
    AND ((SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id()))
  )
  WITH CHECK (
    (SELECT app_can_edit_pipeline())
    AND ((SELECT app_sees_all_departments()) OR department_id = (SELECT app_department_id()))
  );

-- follow_ups ----------------------------------------------------------------
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follow_ups_read ON follow_ups;
CREATE POLICY follow_ups_read ON follow_ups FOR SELECT
  USING (app_sees_patient(patient_id));

DROP POLICY IF EXISTS follow_ups_write ON follow_ups;
CREATE POLICY follow_ups_write ON follow_ups FOR ALL
  USING ((SELECT app_can_edit_pipeline()) AND app_sees_patient(patient_id))
  WITH CHECK ((SELECT app_can_edit_pipeline()) AND app_sees_patient(patient_id));

-- tasks ---------------------------------------------------------------------
-- patient_id is nullable: a task need not be about anyone. Such a task
-- carries no patient data, so department scope has nothing to say about it
-- and it stays visible — unlike an unrouted lead, which does carry contact
-- details.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_read ON tasks;
CREATE POLICY tasks_read ON tasks FOR SELECT
  USING (patient_id IS NULL OR app_sees_patient(patient_id));

DROP POLICY IF EXISTS tasks_write ON tasks;
CREATE POLICY tasks_write ON tasks FOR ALL
  USING (
    (SELECT app_can_edit_pipeline())
    AND (patient_id IS NULL OR app_sees_patient(patient_id))
  )
  WITH CHECK (
    (SELECT app_can_edit_pipeline())
    AND (patient_id IS NULL OR app_sees_patient(patient_id))
  );

-- conversations -------------------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_read ON conversations;
CREATE POLICY conversations_read ON conversations FOR SELECT
  USING (app_sees_patient(patient_id));

DROP POLICY IF EXISTS conversations_write ON conversations;
CREATE POLICY conversations_write ON conversations FOR ALL
  USING ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id))
  WITH CHECK ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id));

-- messages ------------------------------------------------------------------
-- Reached through conversations, which is reached through patients. Two
-- hops, one definition of scope.
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_read ON messages;
CREATE POLICY messages_read ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id));

DROP POLICY IF EXISTS messages_write ON messages;
CREATE POLICY messages_write ON messages FOR ALL
  USING (
    (SELECT app_can_edit_patients())
    AND EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id)
  )
  WITH CHECK (
    (SELECT app_can_edit_patients())
    AND EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id)
  );

-- conversation_reads --------------------------------------------------------
-- Per-staff read state. Nobody has any business reading or writing anyone
-- else's, regardless of role — the same rule as notifications below.
ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_reads FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_reads_own ON conversation_reads;
CREATE POLICY conversation_reads_own ON conversation_reads FOR ALL
  USING (staff_id = (SELECT app_staff_id()))
  WITH CHECK (staff_id = (SELECT app_staff_id()));

-- complaints ----------------------------------------------------------------
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS complaints_read ON complaints;
CREATE POLICY complaints_read ON complaints FOR SELECT
  USING (app_sees_patient(patient_id));

DROP POLICY IF EXISTS complaints_write ON complaints;
CREATE POLICY complaints_write ON complaints FOR ALL
  USING ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id))
  WITH CHECK ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id));

-- feedback ------------------------------------------------------------------
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_read ON feedback;
CREATE POLICY feedback_read ON feedback FOR SELECT
  USING (app_sees_patient(patient_id));

DROP POLICY IF EXISTS feedback_write ON feedback;
CREATE POLICY feedback_write ON feedback FOR ALL
  USING ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id))
  WITH CHECK ((SELECT app_can_edit_patients()) AND app_sees_patient(patient_id));


-- ---------------------------------------------------------------------------
-- 5. Per-staff tables
-- ---------------------------------------------------------------------------
-- plan §5.2: "`notifications` — `staff_id = current_setting('app.staff_id')`.
-- Nobody reads another person's notifications." user_preferences is the same
-- shape and gets the same treatment; it is what PATCH /me/preferences
-- (Phase 05) writes.

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications FOR ALL
  USING (staff_id = (SELECT app_staff_id()))
  WITH CHECK (staff_id = (SELECT app_staff_id()));

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_own ON user_preferences;
CREATE POLICY user_preferences_own ON user_preferences FOR ALL
  USING (staff_id = (SELECT app_staff_id()))
  WITH CHECK (staff_id = (SELECT app_staff_id()));


-- ---------------------------------------------------------------------------
-- 6. audit_log
-- ---------------------------------------------------------------------------
-- plan §5.2: "SELECT for `audit:read` holders only. INSERT for all.
-- UPDATE/DELETE revoked from every role." plan §6 gives the grants.
--
-- INSERT is unconditional on purpose. Audit entries are written by flows
-- with no session: a failed sign-in, or a lockout against an email that
-- never resolved to a staff row (lib/server/auth/lockout.ts, and the reason
-- actor_id is nullable). A policy that required a session would silently
-- lose exactly the entries a security posture most wants.
--
-- SELECT uses app_role_or_null(), the one policy in this file that does not
-- raise when no session is set, for the same reason.

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_read ON audit_log;
CREATE POLICY audit_log_read ON audit_log FOR SELECT
  USING ((SELECT app_holds_audit_read()));

DROP POLICY IF EXISTS audit_log_append ON audit_log;
CREATE POLICY audit_log_append ON audit_log FOR INSERT WITH CHECK (true);

-- No UPDATE or DELETE policy exists, and none should. With RLS forced and no
-- policy for a command, that command matches no rows — but the grants below
-- are the real control, because a privilege revoked cannot be re-granted by
-- an application bug the way a policy can be dropped by one.

REVOKE UPDATE, DELETE ON audit_log FROM careflow_app, careflow_readonly;
GRANT  INSERT, SELECT ON audit_log TO careflow_app;
GRANT  SELECT          ON audit_log TO careflow_readonly;

-- audit_log is partitioned, and both grants and policies are per-relation:
-- drizzle/manual/0005_grants.sql revoked UPDATE/DELETE on the parent only,
-- which left `DELETE FROM audit_log_2026q3` working for careflow_app after
-- its blanket "ALL TABLES IN SCHEMA public" grant. This loop closes that and
-- applies the same policies to every partition, so the guarantee holds
-- whether a statement addresses the parent or a partition directly.
--
-- Phase 07's partition-creation job must run this same block for each new
-- partition, or inherit it by creating partitions through a function that
-- does. A partition created without it is a hole of exactly the shape this
-- loop just closed.
DO $$
DECLARE part regclass;
BEGIN
  FOR part IN
    SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent = 'audit_log'::regclass
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE ON %s FROM careflow_app, careflow_readonly', part);
    EXECUTE format('GRANT INSERT, SELECT ON %s TO careflow_app', part);
    EXECUTE format('GRANT SELECT ON %s TO careflow_readonly', part);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', part);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', part);
    EXECUTE format('DROP POLICY IF EXISTS audit_log_read ON %s', part);
    EXECUTE format('CREATE POLICY audit_log_read ON %s FOR SELECT USING ((SELECT app_holds_audit_read()))', part);
    EXECUTE format('DROP POLICY IF EXISTS audit_log_append ON %s', part);
    EXECUTE format('CREATE POLICY audit_log_append ON %s FOR INSERT WITH CHECK (true)', part);
  END LOOP;
END
$$;


-- ---------------------------------------------------------------------------
-- 7. The directory
-- ---------------------------------------------------------------------------
-- plan §5.2: "`departments`, `doctors`, `staff` — Readable by all
-- authenticated roles. They are the directory."
--
-- RLS is enabled with a deliberately permissive policy rather than left off.
-- Two reasons. First, it makes "every table in this schema has row security
-- enabled" an invariant a test can assert, so a table added in a later phase
-- without a policy fails rather than shipping unprotected. Second, narrowing
-- one of these later becomes a policy edit rather than an enable-plus-policy,
-- which is the change most likely to be made under time pressure.
--
-- These three cannot require a session, and that is not a compromise: the
-- authentication path reads `staff` to discover who is asking
-- (lib/server/auth/session.ts's resolveSession), and invitation acceptance
-- writes it before any session exists. A policy demanding app.staff_id here
-- would make signing in impossible.

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS departments_directory ON departments;
CREATE POLICY departments_directory ON departments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doctors_directory ON doctors;
CREATE POLICY doctors_directory ON doctors FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_directory ON staff;
CREATE POLICY staff_directory ON staff FOR ALL USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- 7.5. The owner's own access
-- ---------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY applies to the table owner as well, which is the
-- whole reason plan §5.2 asks for it. That leaves careflow_owner — the
-- identity that runs migrations and scripts/seed.ts — with no way to write
-- the seed corpus: the seed loads 24 patients and per-staff rows for twelve
-- different people, and no single session context satisfies
-- `staff_id = app_staff_id()` for twelve staff members at once.
--
-- The answer is an explicit permissive policy scoped `TO careflow_owner`,
-- rather than dropping FORCE or granting BYPASSRLS. Three reasons it is the
-- better of those three:
--
--   * careflow_app never matches it. `TO careflow_owner` is checked against
--     the connected role, and DATABASE_URL is careflow_app credentials
--     (drizzle/manual/README.md), so nothing the application does touches
--     this policy.
--   * It is declared. Dropping FORCE would give the owner the same access
--     invisibly, and "it is easy to end up connected as owner while
--     debugging and conclude the policies work" is precisely the failure
--     plan §5.2 names.
--   * BYPASSRLS is a role attribute, not a per-table grant. It cannot be
--     narrowed later, it needs superuser to confer, and this project's
--     README already warns that careflow_app must never acquire it — one
--     fewer role carrying that attribute anywhere is worth having.
--
-- scripts/seed.ts must therefore connect as careflow_owner
-- (CAREFLOW_OWNER_URL_UNPOOLED), not as careflow_app. It did not need to
-- before this migration; see drizzle/manual/README.md.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patients', 'patient_notes', 'patient_documents', 'patient_tags',
    'appointments', 'leads', 'lead_stage_history', 'referrals',
    'follow_ups', 'tasks', 'conversations', 'messages',
    'conversation_reads', 'complaints', 'feedback',
    'notifications', 'user_preferences',
    'departments', 'doctors', 'staff'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO careflow_owner USING (true) WITH CHECK (true)',
      t || '_owner', t
    );
  END LOOP;
END
$$;

-- audit_log's owner access is narrower on purpose: SELECT and INSERT only,
-- no policy for UPDATE or DELETE. plan §6 revokes those from careflow_app
-- and careflow_readonly and says nothing about the owner, which owns the
-- table and could re-grant itself anything — but append-only should not
-- quietly stop being true for the one identity that runs migrations, and
-- writing that down costs two statements.
DROP POLICY IF EXISTS audit_log_owner_read ON audit_log;
CREATE POLICY audit_log_owner_read ON audit_log FOR SELECT TO careflow_owner USING (true);
DROP POLICY IF EXISTS audit_log_owner_append ON audit_log;
CREATE POLICY audit_log_owner_append ON audit_log FOR INSERT TO careflow_owner WITH CHECK (true);

DO $$
DECLARE part regclass;
BEGIN
  FOR part IN
    SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent = 'audit_log'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS audit_log_owner_read ON %s', part);
    EXECUTE format('CREATE POLICY audit_log_owner_read ON %s FOR SELECT TO careflow_owner USING (true)', part);
    EXECUTE format('DROP POLICY IF EXISTS audit_log_owner_append ON %s', part);
    EXECUTE format('CREATE POLICY audit_log_owner_append ON %s FOR INSERT TO careflow_owner WITH CHECK (true)', part);
  END LOOP;
END
$$;


-- ---------------------------------------------------------------------------
-- 8. Deliberately not covered
-- ---------------------------------------------------------------------------
-- Not an oversight; each has a reason, and each is a real gap until the
-- phase named closes it.
--
--   user, session, account, verification, two_factor, auth_attempts,
--   invitations, password_reset_tokens
--     Better Auth's own tables plus Phase 02's. Every one is read or written
--     before a session exists, by definition. They are never exposed to a
--     service call.
--
--   outbound_messages, message_events, campaign_recipients
--     outbound_messages carries a patient's encrypted contact details, so
--     this is the gap that matters most. It cannot be closed yet:
--     lib/server/comms/sandbox.ts inserts here during password reset and
--     invitation delivery, both unauthenticated, and Phase 07's queue
--     workers will write here with no session either. Closing it needs a
--     declared service context (a fourth app.* setting, or a distinct
--     database role for the worker) — that design belongs with Phase 07,
--     which is where the writers land.
--
--   campaigns, workflows, workflow_nodes, workflow_edges, workflow_runs,
--   workflow_run_steps, integrations, tags, seed_anchor
--     No patient rows. Marketing and automation definitions, the tag
--     vocabulary, and the demo clock's anchor. Area-level authorisation in
--     lib/server/authz/policy.ts is the whole of their protection, which is
--     the right level for them.
