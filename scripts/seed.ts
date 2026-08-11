/**
 * Loads every record in lib/data/ into Postgres. plan/01-foundation.md §6.
 *
 * Run with `npm run db:seed` (add `-- --force` to proceed against a
 * database whose audit_log already holds real entries — see §6.3).
 *
 * Three passes, because of the foreign keys (§6.1):
 *   1. departments, staff, tags, integrations
 *   2. doctors, patients — then backfill departments.head_id
 *   3. everything dependent
 *
 * Two rewrites happen along the way, both from §6.2:
 *   - Referral.patientName is resolved against patients.name. Unmatched
 *     referrals keep patient_id NULL and patient_name_raw set.
 *   - Appointment { date, start } collapses into one starts_at, interpreted
 *     as Asia/Manila wall-clock time, not a naive UTC parse.
 *
 * Every fixture date, authored as an offset from the frozen demo clock
 * (TODAY in lib/data/constants.ts), is re-expressed as an offset from
 * *this run's* real calendar date (§7.1) so the dataset looks freshly
 * authored regardless of when the seed runs. A curated subset of
 * "how today looks" columns — the ones a stale demo would visibly break —
 * are additionally recorded in seed_anchor so the nightly re-anchor job
 * (Phase 07) can keep recomputing them without drift (§7.2). Historical
 * fields (registeredAt, submittedAt, receivedAt, ...) are shifted once at
 * seed time but not tracked; re-anchoring exists to stop *today and
 * upcoming* views from going empty, not to preserve every timestamp's
 * position relative to the clock forever.
 *
 * Two aggregate mismatches, both left unresolved on purpose, matching how
 * plan/01-foundation.md §4.8 already treats `departments`: Campaign's
 * sent/delivered/opened/clicked/appointments and WorkflowSummary's
 * runs30d/successRate/nodeCount describe populations far larger than the
 * 24 patients this dataset has. Fabricating thousands of campaign_recipients
 * rows to back them would invent data nowhere in lib/data. Those five
 * Campaign fields and three WorkflowSummary fields are not carried into
 * the database in Phase 01 — campaign_recipients and workflow_runs stay
 * empty until Phase 07 populates them for real.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { eq, inArray, sql } from "drizzle-orm";
import { createDb } from "../lib/server/db";
import { auditLog } from "../lib/server/db/audit-log";
import { toDbEnum } from "../lib/server/db/enum-map";
import * as schema from "../lib/server/db/schema";
import { TODAY, departments as departmentFixtures } from "../lib/data/constants";
import { doctors as doctorFixtures, patients as patientFixtures, staff as staffFixtures } from "../lib/data/people";
import { appointments as appointmentFixtures } from "../lib/data/scheduling";
import { followUps as followUpFixtures, tasks as taskFixtures } from "../lib/data/work";
import { leads as leadFixtures } from "../lib/data/pipeline";
import {
  conversations as conversationFixtures,
  documents as documentFixtures,
  feedback as feedbackFixtures,
  notes as noteFixtures,
  referrals as referralFixtures,
} from "../lib/data/patient-record";
import { complaints as complaintFixtures } from "../lib/data/experience";
import {
  campaigns as campaignFixtures,
  integrations as integrationFixtures,
  workflowGraphs,
  workflows as workflowFixtures,
} from "../lib/data/marketing";
import { notifications as notificationFixtures, seedAudit } from "../lib/data/system";

const TIMEZONE = "Asia/Manila";
const FORCE = process.argv.includes("--force");

const PII_KEY = process.env.PII_ENCRYPTION_KEY;
if (!PII_KEY) {
  throw new Error(
    "seed: PII_ENCRYPTION_KEY is not set. It backs every phone/email/address column " +
      "(plan/01-foundation.md §4.1) and must be present before seeding.",
  );
}

// §1.1: migrations and the seed use the unpooled URL; everything else uses
// the pooled one. This is a separate connection from the app's `db` export.
//
// As of Phase 03 it must also be the *owner's* unpooled URL, not
// careflow_app's. drizzle/manual/0007_row_level_security.sql turns on FORCE
// ROW LEVEL SECURITY across every patient-scoped table, and the seed cannot
// satisfy those policies: it writes per-staff rows (notifications,
// conversation_reads) for twelve different people, and no single session
// context is all twelve at once. careflow_owner has an explicit permissive
// policy for exactly this — see that migration's §7.5.
//
// Falls back to DATABASE_URL_UNPOOLED so a pre-Phase-03 database (or a local
// branch where both URLs are the same role) still seeds; if that URL is
// careflow_app against a database with the policies applied, the first
// INSERT fails with a row-level-security violation rather than writing
// something half-scoped.
const SEED_URL = process.env.CAREFLOW_OWNER_URL_UNPOOLED ?? process.env.DATABASE_URL_UNPOOLED;
if (!SEED_URL) {
  throw new Error(
    "seed: neither CAREFLOW_OWNER_URL_UNPOOLED nor DATABASE_URL_UNPOOLED is set. " +
      "Since Phase 03 the seed needs careflow_owner credentials — see drizzle/manual/README.md.",
  );
}
const db = createDb(SEED_URL);

/* -------------------------------------------------------------------------- */
/* The demo clock, re-anchored to this run                                    */
/* -------------------------------------------------------------------------- */

const TODAY_DATE = new Date(`${TODAY}T00:00:00Z`);
const INSTALL_DATE = new Date();

interface ParsedFixtureInstant {
  offsetDays: number;
  timeOfDay: string | null; // "HH:mm", null for a date-only fixture
}

/** Every fixture date/datetime was produced by lib/data/constants.ts day()/at(). */
function parseFixtureInstant(raw: string): ParsedFixtureInstant {
  const [datePart, timePart] = raw.split("T");
  const offsetDays = differenceInCalendarDays(parseISO(`${datePart}T00:00:00Z`), TODAY_DATE);
  const timeOfDay = timePart ? timePart.slice(0, 5) : null;
  return { offsetDays, timeOfDay };
}

function anchoredDateString(raw: string): string {
  const { offsetDays } = parseFixtureInstant(raw);
  return format(addDays(INSTALL_DATE, offsetDays), "yyyy-MM-dd");
}

/** Returns a real Date, correct in UTC, for a fixture interpreted as Asia/Manila wall-clock time. */
function anchoredTimestamp(raw: string): Date {
  const { offsetDays, timeOfDay } = parseFixtureInstant(raw);
  const dateStr = format(addDays(INSTALL_DATE, offsetDays), "yyyy-MM-dd");
  return fromZonedTime(`${dateStr}T${timeOfDay ?? "00:00"}:00`, TIMEZONE);
}

type AnchorRow = { tableName: string; rowId: string; dayOffset: number; timeOfDay: string | null };
const anchorRows: AnchorRow[] = [];

/**
 * seed_anchor.row_id is the table's real (DB-generated) UUID, which does
 * not exist yet while a fixture's insert VALUES are still being built.
 * anchor()/anchorDate() below record the offset keyed by the fixture's
 * business reference instead; once the insert's .returning() reveals the
 * real UUID, resolvePendingAnchors() moves each entry from here into
 * anchorRows using that UUID. Keyed by "tableKey:reference" so the same
 * reference string can't collide across different anchored tables.
 */
const pendingAnchors = new Map<string, { tableKey: string; dayOffset: number; timeOfDay: string | null }>();

function resolvePendingAnchors(tableKey: string, rows: { id: string; reference: string }[]) {
  for (const row of rows) {
    const pending = pendingAnchors.get(`${tableKey}:${row.reference}`);
    if (!pending) continue;
    anchorRows.push({ tableName: tableKey, rowId: row.id, dayOffset: pending.dayOffset, timeOfDay: pending.timeOfDay });
  }
}

/**
 * Registers `raw` (a lib/data fixture date/datetime) for nightly re-anchoring
 * and returns the shifted timestamp to store right now. `tableKey` is the
 * literal table name for a single-anchor table, or "table.column" when a
 * table has more than one column worth re-anchoring (seed_anchor's primary
 * key is (table_name, row_id), so disambiguation happens in the key).
 * `reference` is the fixture's business reference (e.g. "AP-40871"), not
 * its future UUID — see resolvePendingAnchors().
 */
function anchor(tableKey: string, reference: string, raw: string): Date {
  const { offsetDays, timeOfDay } = parseFixtureInstant(raw);
  pendingAnchors.set(`${tableKey}:${reference}`, { tableKey, dayOffset: offsetDays, timeOfDay });
  return anchoredTimestamp(raw);
}

/**
 * Same tracking as anchor(), for a DATE column. Deliberately separate from
 * anchor(): a DATE column must not go through anchoredTimestamp()'s
 * Asia/Manila conversion and then get truncated back to a date via
 * toISOString() — that round trip can land on the wrong calendar day
 * whenever the UTC offset crosses midnight.
 */
function anchorDate(tableKey: string, reference: string, raw: string): string {
  const { offsetDays } = parseFixtureInstant(raw);
  pendingAnchors.set(`${tableKey}:${reference}`, { tableKey, dayOffset: offsetDays, timeOfDay: null });
  return anchoredDateString(raw);
}

/* -------------------------------------------------------------------------- */
/* PII                                                                         */
/* -------------------------------------------------------------------------- */

/** pgp_sym_encrypt runs in Postgres, not in Node — the key never holds the plaintext in JS memory longer than necessary. */
function encrypted(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  return sql`pgp_sym_encrypt(${value}, ${PII_KEY})`;
}

/** Same as encrypted(), typed for the NOT NULL contact columns (patients.phone, doctors.phone/email, staff.email). */
function encryptedRequired(value: string) {
  return sql`pgp_sym_encrypt(${value}, ${PII_KEY})`;
}

function last2(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-2).padStart(2, "0");
}

function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.split("@")[1] ?? null;
}

function cityOf(address: string): string {
  const parts = address.split(",");
  return parts[parts.length - 1]?.trim() ?? address;
}

/* -------------------------------------------------------------------------- */
/* Pre-flight                                                                  */
/* -------------------------------------------------------------------------- */

async function preflight() {
  const result = await db.execute<{ count: string }>(sql`SELECT count(*)::text FROM audit_log`);
  const auditCount = Number(result.rows[0]!.count);
  if (auditCount > 0 && !FORCE) {
    throw new Error(
      `seed: audit_log has ${auditCount} row(s) already — that is the signature of a database ` +
        `someone has actually used (plan/01-foundation.md §6.3). Re-run with --force to proceed ` +
        `anyway; the seed audit trail itself will not be re-appended.`,
    );
  }
  return { auditWasEmpty: auditCount === 0 };
}

/* -------------------------------------------------------------------------- */
/* Pass 1 — departments, staff, tags, integrations                            */
/* -------------------------------------------------------------------------- */

async function seedDepartments() {
  const rows = departmentFixtures.map((d) => ({
    slug: d.id,
    name: d.name,
    floor: d.floor,
  }));
  const inserted = await db
    .insert(schema.departments)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.departments.slug,
      set: { name: sql`excluded.name`, floor: sql`excluded.floor` },
    })
    .returning({ id: schema.departments.id, slug: schema.departments.slug });
  return new Map(inserted.map((r) => [r.slug, r.id]));
}

async function seedStaff() {
  const rows = staffFixtures.map((s) => ({
    reference: s.id,
    name: s.name,
    initials: s.initials,
    role: s.role,
    departmentId: null as string | null, // backfilled below
    emailEncrypted: encryptedRequired(s.email),
    emailDomain: domainOf(s.email)!,
    // plan/02-authentication.md §6.3: "The 12 staff in lib/data/people.ts
    // are seeded as staff rows with status = 'invited' and no user_id ...
    // None of them can sign in until someone [sends them an invitation]."
    // Task 3 (task-3-brief.md §3) found this had drifted — this line used
    // to read `status: toDbEnum(s.status)`, carrying the fixture's own
    // *demo-display* status (mostly "active", for how the front-end-only
    // build wants the table to look) straight into the DB column, even
    // though none of these rows have a user_id/credential and genuinely
    // cannot sign in. Hardcoded to "invited" here regardless of what the
    // fixture says, matching what a row with no linked account actually
    // is. `mfaEnabled` gets the same treatment for the same reason: a row
    // with no `user_id` has no `two_factor` row either, so `true` here
    // would be a lie about TOTP enrolment that never happened.
    // `lastActiveAt` is left as the fixture drives it (existing comment
    // right below already flags it as a known cosmetic placeholder,
    // "becomes real once Phase 02 sessions exist" — that's a
    // session-write-path concern, not a seed-time one, and out of this
    // task's narrower "status"/"user_id" scope per the brief).
    status: "invited" as const,
    lastActiveAt: s.lastActive === "never" ? null : new Date(), // "2 minutes ago" etc. has no stable absolute meaning; last sign-in becomes real once Phase 02 sessions exist
    mfaEnabled: false,
    joinedAt: anchoredDateString(s.joinedAt),
  }));
  const inserted = await db
    .insert(schema.staff)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.staff.reference,
      set: {
        name: sql`excluded.name`,
        initials: sql`excluded.initials`,
        role: sql`excluded.role`,
        status: sql`excluded.status`,
        mfaEnabled: sql`excluded.mfa_enabled`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: schema.staff.id, reference: schema.staff.reference });
  const byRef = new Map(inserted.map((r) => [r.reference, r.id]));

  // departmentId couldn't be resolved until departments existed; do it as a
  // second statement per row rather than blocking pass 1 on pass 2's data.
  for (const s of staffFixtures) {
    if (!s.departmentId) continue;
    const staffId = byRef.get(s.id)!;
    await db.execute(
      sql`UPDATE staff SET department_id = (SELECT id FROM departments WHERE slug = ${s.departmentId}) WHERE id = ${staffId}`,
    );
  }

  const byName = new Map(staffFixtures.map((s) => [s.name, byRef.get(s.id)!]));
  return { byRef, byName };
}

async function seedTags() {
  const { patientTags: tagList } = await import("../lib/data/constants");
  const labels = [...new Set(patientFixtures.flatMap((p) => p.tags))];
  if (labels.length === 0) return new Map<string, string>();
  const inserted = await db
    .insert(schema.tags)
    .values(labels.map((label) => ({ label })))
    .onConflictDoUpdate({ target: schema.tags.label, set: { label: sql`excluded.label` } })
    .returning({ id: schema.tags.id, label: schema.tags.label });
  void tagList;
  return new Map(inserted.map((r) => [r.label, r.id]));
}

async function seedIntegrations() {
  await db
    .insert(schema.integrations)
    .values(
      integrationFixtures.map((i) => ({
        slug: i.id,
        name: i.name,
        category: i.category,
        description: i.description,
        status: toDbEnum(i.status),
        lastSyncAt: i.lastSync ? anchoredTimestamp(i.lastSync) : null,
      })),
    )
    .onConflictDoUpdate({
      target: schema.integrations.slug,
      set: { status: sql`excluded.status`, lastSyncAt: sql`excluded.last_sync_at` },
    });
}

/* -------------------------------------------------------------------------- */
/* Pass 2 — doctors, patients, then backfill departments.head_id              */
/* -------------------------------------------------------------------------- */

async function seedDoctors(deptBySlug: Map<string, string>) {
  const rows = doctorFixtures.map((d) => ({
    reference: d.id,
    name: d.name,
    initials: d.initials,
    specialty: d.specialty,
    departmentId: deptBySlug.get(d.departmentId) ?? null,
    status: toDbEnum(d.status),
    phoneEncrypted: encryptedRequired(d.phone),
    phoneLast2: last2(d.phone),
    emailEncrypted: encryptedRequired(d.email),
    emailDomain: domainOf(d.email)!,
    appointmentsToday: d.appointmentsToday,
    patients: d.patients,
    satisfaction: d.satisfaction.toFixed(1),
    noShowRate: d.noShowRate.toFixed(1),
    yearsExperience: d.yearsExperience,
    languages: d.languages,
    schedule: d.schedule,
  }));
  const inserted = await db
    .insert(schema.doctors)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.doctors.reference,
      set: {
        status: sql`excluded.status`,
        appointmentsToday: sql`excluded.appointments_today`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: schema.doctors.id, reference: schema.doctors.reference });
  return { byRef: new Map(inserted.map((r) => [r.reference, r.id])), byName: new Map(doctorFixtures.map((d, i) => [d.name, inserted[i].id])) };
}

async function seedPatients(deptBySlug: Map<string, string>, doctorByRef: Map<string, string>) {
  const rows = patientFixtures.map((p) => ({
    reference: p.id,
    name: p.name,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender,
    phoneEncrypted: encryptedRequired(p.phone),
    emailEncrypted: encrypted(p.email),
    addressEncrypted: encrypted(p.address),
    phoneLast2: last2(p.phone),
    emailDomain: domainOf(p.email),
    addressCity: cityOf(p.address),
    emergencyContact: p.emergencyContact,
    preferredChannel: toDbEnum(p.preferredChannel),
    departmentId: deptBySlug.get(p.departmentId) ?? null,
    doctorId: doctorByRef.get(p.doctorId) ?? null,
    registeredAt: anchoredDateString(p.registeredAt),
    lastVisit: p.lastVisit ? anchoredDateString(p.lastVisit) : null,
    nextAppointment: p.nextAppointment ? anchoredDateString(p.nextAppointment) : null,
    status: toDbEnum(p.status),
    insurance: p.insurance,
    source: p.source,
    satisfaction: p.satisfaction === null ? null : p.satisfaction.toFixed(1),
    notes: p.notes,
  }));
  const inserted = await db
    .insert(schema.patients)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.patients.reference,
      set: {
        status: sql`excluded.status`,
        lastVisit: sql`excluded.last_visit`,
        nextAppointment: sql`excluded.next_appointment`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: schema.patients.id, reference: schema.patients.reference, name: schema.patients.name });

  const byRef = new Map(inserted.map((r) => [r.reference, r.id]));
  const byName = new Map(inserted.map((r) => [r.name, r.id]));
  return { byRef, byName };
}

async function backfillDepartmentHeads(doctorByName: Map<string, string>) {
  for (const d of departmentFixtures) {
    const headId = doctorByName.get(d.head);
    if (!headId) continue;
    await db.execute(sql`UPDATE departments SET head_id = ${headId} WHERE slug = ${d.id}`);
  }
}

async function seedPatientTags(tagByLabel: Map<string, string>, patientByRef: Map<string, string>) {
  const rows: { patientId: string; tagId: string }[] = [];
  for (const p of patientFixtures) {
    const patientId = patientByRef.get(p.id)!;
    for (const label of p.tags) {
      const tagId = tagByLabel.get(label);
      if (tagId) rows.push({ patientId, tagId });
    }
  }
  if (rows.length === 0) return;
  await db.insert(schema.patientTags).values(rows).onConflictDoNothing();
}

/* -------------------------------------------------------------------------- */
/* Pass 3 — everything dependent                                              */
/* -------------------------------------------------------------------------- */

async function seedAppointments(
  patientByRef: Map<string, string>,
  doctorByRef: Map<string, string>,
  deptBySlug: Map<string, string>,
) {
  const rows = appointmentFixtures.flatMap((a) => {
    const patientId = patientByRef.get(a.patientId);
    const doctorId = doctorByRef.get(a.doctorId);
    const departmentId = deptBySlug.get(a.departmentId);
    if (!patientId || !doctorId || !departmentId) return [];
    return [
      {
        reference: a.id,
        patientId,
        doctorId,
        departmentId,
        type: a.type,
        startsAt: anchor("appointments", a.id, `${a.date}T${a.start}`),
        durationMinutes: a.durationMinutes,
        location: a.location,
        status: toDbEnum(a.status),
        reason: a.reason,
        notes: a.notes,
        reminderChannel: a.reminderChannel ? toDbEnum(a.reminderChannel) : null,
      },
    ];
  });
  const inserted = await db
    .insert(schema.appointments)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.appointments.reference,
      set: { status: sql`excluded.status`, startsAt: sql`excluded.starts_at`, updatedAt: sql`now()` },
    })
    .returning({ id: schema.appointments.id, reference: schema.appointments.reference });
  resolvePendingAnchors("appointments", inserted);
}

async function seedLeads(deptBySlug: Map<string, string>, staffByRef: Map<string, string>, patientByRef: Map<string, string>) {
  const inserted = await db
    .insert(schema.leads)
    .values(
      leadFixtures.map((l) => ({
        reference: l.id,
        name: l.name,
        phoneEncrypted: encrypted(l.phone),
        emailEncrypted: encrypted(l.email),
        source: l.source,
        departmentId: deptBySlug.get(l.departmentId) ?? null,
        interest: l.interest,
        stage: toDbEnum(l.stage),
        ownerId: staffByRef.get(l.ownerId) ?? null,
        priority: toDbEnum(l.priority),
        valueCents: Math.round(l.value * 100),
        inquiry: l.inquiry,
        convertedPatientId: l.stage === "converted" ? (patientByRef.get(l.name) ?? null) : null,
        createdAt: anchoredTimestamp(l.createdAt),
        lastContactAt: l.lastContact ? anchoredTimestamp(l.lastContact) : null,
        nextFollowUp: l.nextFollowUp ? anchoredDateString(l.nextFollowUp) : null,
      })),
    )
    .onConflictDoUpdate({
      target: schema.leads.reference,
      set: { stage: sql`excluded.stage`, lastContactAt: sql`excluded.last_contact_at` },
    })
    .returning({ id: schema.leads.id, reference: schema.leads.reference });
  const byRef = new Map(inserted.map((r) => [r.reference, r.id]));

  // No stage-change history exists in the seed model — one row per lead
  // recording its current stage as the only known transition. A real lead
  // accrues many history rows over its lifetime, so `lead_id` correctly
  // has no unique constraint; idempotency for this seed-authored row
  // comes from deleting it and reinserting, scoped to just these leads.
  const leadIds = [...byRef.values()];
  if (leadIds.length > 0) {
    await db.delete(schema.leadStageHistory).where(inArray(schema.leadStageHistory.leadId, leadIds));
  }
  const historyRows = leadFixtures.map((l) => ({
    leadId: byRef.get(l.id)!,
    fromStage: null,
    toStage: toDbEnum(l.stage),
    movedBy: staffByRef.get(l.ownerId) ?? null,
    movedAt: anchoredTimestamp(l.createdAt),
  }));
  await db.insert(schema.leadStageHistory).values(historyRows);
}

async function seedReferrals(deptBySlug: Map<string, string>, staffByRef: Map<string, string>, patientByName: Map<string, string>) {
  let matched = 0;
  const rows = referralFixtures.map((r) => {
    const patientId = patientByName.get(r.patientName) ?? null;
    if (patientId) matched++;
    return {
      reference: r.id,
      patientId,
      patientNameRaw: r.patientName,
      provider: r.provider,
      providerType: r.providerType,
      departmentId: deptBySlug.get(r.departmentId) ?? null,
      receivedAt: anchoredTimestamp(r.receivedAt),
      status: toDbEnum(r.status),
      ownerId: staffByRef.get(r.ownerId) ?? null,
      outcome: r.outcome,
      valueCents: Math.round(r.value * 100),
    };
  });
  await db
    .insert(schema.referrals)
    .values(rows)
    .onConflictDoUpdate({ target: schema.referrals.reference, set: { status: sql`excluded.status` } });
  console.log(`  referrals: ${matched}/${referralFixtures.length} matched to an existing patient by name`);
}

async function seedFollowUps(patientByRef: Map<string, string>, staffByRef: Map<string, string>) {
  const rows = followUpFixtures.flatMap((f) => {
    const patientId = patientByRef.get(f.patientId);
    if (!patientId) return [];
    return [
      {
        reference: f.id,
        patientId,
        type: f.type,
        ownerId: staffByRef.get(f.ownerId) ?? null,
        dueDate: anchorDate("follow_ups", f.id, f.dueDate),
        priority: toDbEnum(f.priority),
        completedAt: f.status === "completed" ? new Date() : null,
        note: f.note,
      },
    ];
  });
  const inserted = await db
    .insert(schema.followUps)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.followUps.reference,
      set: { dueDate: sql`excluded.due_date`, completedAt: sql`excluded.completed_at`, updatedAt: sql`now()` },
    })
    .returning({ id: schema.followUps.id, reference: schema.followUps.reference });
  resolvePendingAnchors("follow_ups", inserted);
}

async function seedTasks(patientByRef: Map<string, string>, staffByRef: Map<string, string>) {
  const rows = taskFixtures.map((t) => ({
    reference: t.id,
    title: t.title,
    patientId: t.patientId ? (patientByRef.get(t.patientId) ?? null) : null,
    category: t.category,
    ownerId: staffByRef.get(t.ownerId)!,
    priority: toDbEnum(t.priority),
    dueDate: anchorDate("tasks", t.id, t.dueDate),
    status: toDbEnum(t.status),
    completedAt: t.status === "done" ? new Date() : null,
  }));
  const inserted = await db
    .insert(schema.tasks)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.tasks.reference,
      set: { status: sql`excluded.status`, dueDate: sql`excluded.due_date`, updatedAt: sql`now()` },
    })
    .returning({ id: schema.tasks.id, reference: schema.tasks.reference });
  resolvePendingAnchors("tasks", inserted);
}

async function seedConversations(patientByRef: Map<string, string>, staffByRef: Map<string, string>) {
  for (const c of conversationFixtures) {
    const patientId = patientByRef.get(c.patientId);
    if (!patientId) continue;
    const [conv] = await db
      .insert(schema.conversations)
      .values({
        reference: c.id,
        patientId,
        channel: toDbEnum(c.channel),
        subject: c.subject,
        assignedTo: c.assignedTo ? (staffByRef.get(c.assignedTo) ?? null) : null,
        lastMessageAt: anchoredTimestamp(c.lastMessageAt),
      })
      .onConflictDoUpdate({
        target: schema.conversations.reference,
        set: { lastMessageAt: sql`excluded.last_message_at` },
      })
      .returning({ id: schema.conversations.id });

    // Messages have no business reference to upsert on — real messages
    // never need one (nobody quotes "message m-1042" over the phone), so
    // adding one here would be a schema column that exists only for the
    // seed's benefit. Deleting this conversation's seed-authored messages
    // before reinserting is what keeps the seed idempotent instead.
    await db.delete(schema.messages).where(eq(schema.messages.conversationId, conv.id));
    await db.insert(schema.messages).values(
      c.messages.map((m) => ({
        conversationId: conv.id,
        direction: toDbEnum(m.direction),
        channel: toDbEnum(m.channel),
        body: m.body,
        authorId: m.authorId ? (staffByRef.get(m.authorId) ?? null) : null,
        internal: m.internal ?? false,
        sentAt: anchoredTimestamp(m.sentAt),
      })),
    );

    // The seed model's `unread` is a single boolean; here it becomes "has
    // the assigned staff member read past the last message". A row means
    // read; its absence means unread — matching Conversation.unread exactly
    // for the one staff member the demo model knows about.
    if (!c.unread && c.assignedTo) {
      const staffId = staffByRef.get(c.assignedTo);
      if (staffId) {
        await db
          .insert(schema.conversationReads)
          .values({ conversationId: conv.id, staffId, readAt: anchoredTimestamp(c.lastMessageAt) })
          .onConflictDoNothing();
      }
    }
  }
}

async function seedFeedback(patientByRef: Map<string, string>, deptBySlug: Map<string, string>, doctorByRef: Map<string, string>) {
  const rows = feedbackFixtures.flatMap((f) => {
    const patientId = patientByRef.get(f.patientId);
    if (!patientId) return [];
    return [
      {
        reference: f.id,
        patientId,
        departmentId: deptBySlug.get(f.departmentId) ?? null,
        doctorId: doctorByRef.get(f.doctorId) ?? null,
        rating: f.rating,
        category: f.category,
        comment: f.comment,
        status: toDbEnum(f.status),
        submittedAt: anchoredTimestamp(f.submittedAt),
      },
    ];
  });
  await db.insert(schema.feedback).values(rows).onConflictDoUpdate({ target: schema.feedback.reference, set: { status: sql`excluded.status` } });
}

async function seedComplaints(patientByRef: Map<string, string>, deptBySlug: Map<string, string>, staffByRef: Map<string, string>) {
  const rows = complaintFixtures.flatMap((c) => {
    const patientId = patientByRef.get(c.patientId);
    if (!patientId) return [];
    return [
      {
        reference: c.id,
        patientId,
        departmentId: deptBySlug.get(c.departmentId) ?? null,
        subject: c.subject,
        description: c.description,
        type: c.type,
        ownerId: staffByRef.get(c.ownerId) ?? null,
        priority: toDbEnum(c.priority),
        status: toDbEnum(c.status),
        openedAt: anchoredTimestamp(c.openedAt),
        slaDueAt: anchor("complaints.sla_due_at", c.id, c.slaDueAt),
        resolvedAt: c.status === "resolved" || c.status === "closed" ? new Date() : null,
        resolution: c.resolution,
      },
    ];
  });
  const inserted = await db
    .insert(schema.complaints)
    .values(rows)
    .onConflictDoUpdate({ target: schema.complaints.reference, set: { status: sql`excluded.status`, slaDueAt: sql`excluded.sla_due_at` } })
    .returning({ id: schema.complaints.id, reference: schema.complaints.reference });
  resolvePendingAnchors("complaints.sla_due_at", inserted);
}

async function seedDocuments(patientByRef: Map<string, string>, staffByName: Map<string, string>) {
  const rows = documentFixtures.flatMap((d) => {
    const patientId = patientByRef.get(d.patientId);
    if (!patientId) return [];
    const ext = d.name.split(".").pop()?.toLowerCase();
    const contentType = ext === "pdf" ? "application/pdf" : "application/octet-stream";
    return [
      {
        reference: d.id,
        patientId,
        label: d.name,
        category: d.kind,
        blobKey: null, // no real file bytes at seed time — a null blob_key 404s on download, which is honest
        contentType,
        sizeBytes: d.sizeKb * 1024,
        // Placeholder — there is no real file to hash. Real uploads (Phase 08 §3.4) replace this.
        checksum: createHash("sha256").update(`${d.id}:${d.name}`).digest("hex"),
        scanStatus: "unscanned",
        uploadedBy: staffByName.get(d.uploadedBy) ?? null,
        createdAt: anchoredTimestamp(d.uploadedAt),
      },
    ];
  });
  if (rows.length === 0) return;
  await db.insert(schema.patientDocuments).values(rows).onConflictDoNothing();
}

async function seedNotes(patientByRef: Map<string, string>, staffByName: Map<string, string>) {
  const rows = noteFixtures.flatMap((n) => {
    const patientId = patientByRef.get(n.patientId);
    if (!patientId) return [];
    return [
      {
        reference: n.id,
        patientId,
        body: n.body,
        authorId: staffByName.get(n.author) ?? staffByName.values().next().value!,
        pinned: n.pinned ?? false,
        createdAt: anchoredTimestamp(n.createdAt),
      },
    ];
  });
  if (rows.length === 0) return;
  await db
    .insert(schema.patientNotes)
    .values(rows)
    .onConflictDoUpdate({ target: schema.patientNotes.reference, set: { pinned: sql`excluded.pinned` } });
}

async function seedCampaigns(staffByRef: Map<string, string>) {
  const inserted = await db
    .insert(schema.campaigns)
    .values(
      campaignFixtures.map((c) => ({
        reference: c.id,
        name: c.name,
        type: c.type,
        channel: toDbEnum(c.channel),
        status: toDbEnum(c.status),
        // No real audience filter exists in the seed model — the free-text
        // description is preserved as the closest honest substitute. See
        // this file's header comment on the funnel-count aggregate mismatch.
        audienceQuery: { description: c.audience, audienceSize: c.audienceSize },
        startedAt: anchor("campaigns", c.id, c.startedAt),
      })),
    )
    .onConflictDoUpdate({ target: schema.campaigns.reference, set: { status: sql`excluded.status` } })
    .returning({ id: schema.campaigns.id, reference: schema.campaigns.reference });
  resolvePendingAnchors("campaigns", inserted);
  void staffByRef;
}

async function seedWorkflows(staffByRef: Map<string, string>) {
  const inserted = await db
    .insert(schema.workflows)
    .values(
      workflowFixtures.map((w) => ({
        reference: w.id,
        name: w.name,
        description: w.description,
        status: toDbEnum(w.status),
        triggerKind: w.trigger,
        updatedAt: anchoredTimestamp(w.updatedAt),
      })),
    )
    .onConflictDoUpdate({ target: schema.workflows.reference, set: { status: sql`excluded.status` } })
    .returning({ id: schema.workflows.id, reference: schema.workflows.reference });
  const byRef = new Map(inserted.map((r) => [r.reference, r.id]));
  void staffByRef;

  // Only the graphs actually authored in workflowGraphs get real nodes and
  // edges. The rest render a generated linear sketch client-side — that
  // fallback is a UI concern, not seed data.
  for (const [workflowRef, graph] of Object.entries(workflowGraphs)) {
    const workflowId = byRef.get(workflowRef);
    if (!workflowId) continue;
    // Nodes and edges have no business reference either (a real workflow
    // builder lets a user freely add/rename/remove nodes — there is no
    // fixture-style "trigger-1" identity to upsert on). Deleting this
    // workflow's seed-authored nodes before reinserting keeps the seed
    // idempotent; edges cascade-delete with their nodes (schema.ts
    // workflowEdges.sourceNodeId/targetNodeId are onDelete: "cascade").
    await db.delete(schema.workflowNodes).where(eq(schema.workflowNodes.workflowId, workflowId));
    const nodeIdByLocalId = new Map<string, string>();
    for (const node of graph.nodes) {
      const [row] = await db
        .insert(schema.workflowNodes)
        .values({
          workflowId,
          kind: toDbEnum(node.kind),
          label: node.label,
          config: { detail: node.detail },
          position: { x: node.x, y: node.y },
        })
        .returning({ id: schema.workflowNodes.id });
      nodeIdByLocalId.set(node.id, row.id);
    }
    const edgeRows = graph.edges.flatMap((edge) => {
      const sourceNodeId = nodeIdByLocalId.get(edge.from);
      const targetNodeId = nodeIdByLocalId.get(edge.to);
      if (!sourceNodeId || !targetNodeId) return [];
      return [{ workflowId, sourceNodeId, targetNodeId, condition: edge.label ?? null }];
    });
    if (edgeRows.length > 0) await db.insert(schema.workflowEdges).values(edgeRows);
  }
}

async function seedNotifications(staffByRef: Map<string, string>) {
  // AppNotification has no owning staff member in the seed model — it was
  // one shared array (docs/DATABASE.md §1.7). All rows are attributed to
  // CURRENT_USER (u-001), the account the demo build renders as.
  const staffId = staffByRef.get("u-001");
  if (!staffId) return;
  // Real notifications are created dynamically by the app and have no
  // business reference either. Deleting this staff member's
  // seed-authored notifications before reinserting keeps the seed
  // idempotent.
  await db.delete(schema.notifications).where(eq(schema.notifications.staffId, staffId));
  await db.insert(schema.notifications).values(
    notificationFixtures.map((n) => ({
      staffId,
      category: toDbEnum(n.category),
      title: n.title,
      body: n.body,
      href: n.href,
      tone: toDbEnum(n.tone),
      readAt: n.read ? anchoredTimestamp(n.createdAt) : null,
      createdAt: anchoredTimestamp(n.createdAt),
    })),
  );
}

async function seedAuditTrail(staffByRef: Map<string, string>, auditWasEmpty: boolean) {
  if (!auditWasEmpty) {
    console.log("  audit_log: skipped — already had entries before this run (never re-appended)");
    return;
  }
  const rows = seedAudit.flatMap((a) => {
    const actorId = staffByRef.get(a.actorId);
    if (!actorId) return [];
    return [
      {
        actorId,
        actorName: a.actorName,
        action: toDbEnum(a.action),
        resourceType: a.resource,
        resourceId: a.resourceId,
        field: a.field,
        previousValue: a.previousValue,
        newValue: a.newValue,
        occurredAt: anchoredTimestamp(a.timestamp),
        ipAddress: a.ip,
        userAgent: a.device,
      },
    ];
  });
  if (rows.length > 0) await db.insert(auditLog).values(rows);
}

async function flushSeedAnchor() {
  if (anchorRows.length === 0) return;
  await db
    .insert(schema.seedAnchor)
    .values(anchorRows.map((r) => ({ tableName: r.tableName, rowId: r.rowId, dayOffset: r.dayOffset, timeOfDay: r.timeOfDay })))
    .onConflictDoUpdate({
      target: [schema.seedAnchor.tableName, schema.seedAnchor.rowId],
      set: { dayOffset: sql`excluded.day_offset`, timeOfDay: sql`excluded.time_of_day` },
    });
  console.log(`  seed_anchor: ${anchorRows.length} row(s) tracked for nightly re-anchoring`);
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`seed: install date ${format(INSTALL_DATE, "yyyy-MM-dd")}, demo clock anchor ${TODAY}`);
  const { auditWasEmpty } = await preflight();

  console.log("pass 1: departments, staff, tags, integrations");
  const deptBySlug = await seedDepartments();
  const { byRef: staffByRef, byName: staffByName } = await seedStaff();
  const tagByLabel = await seedTags();
  await seedIntegrations();

  console.log("pass 2: doctors, patients, department heads");
  const { byRef: doctorByRef, byName: doctorByName } = await seedDoctors(deptBySlug);
  const { byRef: patientByRef, byName: patientByName } = await seedPatients(deptBySlug, doctorByRef);
  await backfillDepartmentHeads(doctorByName);
  await seedPatientTags(tagByLabel, patientByRef);

  console.log("pass 3: everything dependent");
  await seedAppointments(patientByRef, doctorByRef, deptBySlug);
  await seedLeads(deptBySlug, staffByRef, patientByRef);
  await seedReferrals(deptBySlug, staffByRef, patientByName);
  await seedFollowUps(patientByRef, staffByRef);
  await seedTasks(patientByRef, staffByRef);
  await seedConversations(patientByRef, staffByRef);
  await seedFeedback(patientByRef, deptBySlug, doctorByRef);
  await seedComplaints(patientByRef, deptBySlug, staffByRef);
  await seedDocuments(patientByRef, staffByName);
  await seedNotes(patientByRef, staffByName);
  await seedCampaigns(staffByRef);
  await seedWorkflows(staffByRef);
  await seedNotifications(staffByRef);
  await seedAuditTrail(staffByRef, auditWasEmpty);

  await flushSeedAnchor();

  console.log("seed: done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
