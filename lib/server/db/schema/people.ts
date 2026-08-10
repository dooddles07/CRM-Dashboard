import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea } from "./columns";
import { channel, doctorStatus, patientStatus, staffStatus } from "./enums";
import { departments } from "./org";
import { user } from "./auth";

/**
 * docs/DATABASE.md §2.3, plus the encrypted contact columns from
 * plan/01-foundation.md §4.1. `notes` is the single free-text field carried
 * over from the seed model — distinct from the structured, authored
 * `patient_notes` table below.
 */
export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    name: text("name").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    gender: text("gender").notNull(),

    phoneEncrypted: bytea("phone_encrypted").notNull(),
    emailEncrypted: bytea("email_encrypted"),
    addressEncrypted: bytea("address_encrypted"),
    phoneLast2: char("phone_last2", { length: 2 }).notNull(),
    emailDomain: text("email_domain"),
    addressCity: text("address_city"),

    emergencyContact: jsonb("emergency_contact").$type<{
      name: string;
      relation: string;
      phone: string;
    }>(),
    preferredChannel: channel("preferred_channel").notNull().default("sms"),
    departmentId: uuid("department_id").references(() => departments.id),
    doctorId: uuid("doctor_id").references((): typeof doctors.id => doctors.id),
    registeredAt: date("registered_at").notNull(),
    lastVisit: date("last_visit"),
    nextAppointment: date("next_appointment"),
    status: patientStatus("status").notNull().default("new"),
    insurance: text("insurance"),
    source: text("source").notNull(),
    satisfaction: numeric("satisfaction", { precision: 2, scale: 1 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_patients_department")
      .on(table.departmentId)
      .where(sql`${table.archivedAt} IS NULL`),
    index("idx_patients_doctor")
      .on(table.doctorId)
      .where(sql`${table.archivedAt} IS NULL`),
    index("idx_patients_status")
      .on(table.status)
      .where(sql`${table.archivedAt} IS NULL`),
    index("idx_patients_name_trgm").using("gin", sql`${table.name} gin_trgm_ops`),
  ],
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull().unique(),
});

export const patientTags = pgTable(
  "patient_tags",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.patientId, table.tagId] })],
);

/**
 * Not part of docs/DATABASE.md Part 2 — authored here because the seed
 * model's `PatientNote` (lib/data/patient-record.ts) has no proposed schema
 * elsewhere. Same soft-delete-free shape as the rest of the record spine:
 * notes are never edited or deleted, only added.
 */
export const patientNotes = pgTable(
  "patient_notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references((): typeof staff.id => staff.id),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_patient_notes_patient").on(table.patientId, table.createdAt)],
);

/**
 * docs/DATABASE.md §2.3: "staff and doctors follow the same shape: UUID
 * key, human reference, department FK, encrypted contact columns, soft
 * delete." Performance figures (appointmentsToday, patients, satisfaction,
 * noShowRate) are stored rather than derived, unlike the department
 * rollup in §4.8 — Phase 01 scope stops at the 37-screen inventory audited,
 * which does not include a doctor analytics view.
 */
export const doctors = pgTable("doctors", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  specialty: text("specialty").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  status: doctorStatus("status").notNull().default("available"),

  phoneEncrypted: bytea("phone_encrypted").notNull(),
  phoneLast2: char("phone_last2", { length: 2 }).notNull(),
  emailEncrypted: bytea("email_encrypted").notNull(),
  emailDomain: text("email_domain").notNull(),

  appointmentsToday: integer("appointments_today").notNull().default(0),
  patients: integer("patients").notNull().default(0),
  satisfaction: numeric("satisfaction", { precision: 2, scale: 1 }),
  noShowRate: numeric("no_show_rate", { precision: 4, scale: 1 }),
  yearsExperience: smallint("years_experience").notNull(),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  schedule: jsonb("schedule")
    .$type<{ day: string; from: string; to: string }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/**
 * plan/01-foundation.md §4.6. The bytes live in Vercel Blob (Phase 08 §3.4);
 * this table carries metadata only. `blob_key` stays nullable so the 8 seed
 * documents can exist as metadata without invented file bodies — a row
 * with a null `blob_key` renders in the list and 404s on download, which
 * is honest about what it is. Deleting a document removes the blob and
 * sets `archived_at`; the row and its audit trail outlive the file.
 */
export const patientDocuments = pgTable("patient_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  label: text("label").notNull(),
  category: text("category").notNull(),
  blobKey: text("blob_key"),
  contentType: text("content_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull(),
  scanStatus: text("scan_status").notNull().default("unscanned"),
  uploadedBy: uuid("uploaded_by").references((): typeof staff.id => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/**
 * `role` stays TEXT; Phase 03 turns the nine-role matrix into code and
 * decides there whether it becomes an enum or a lookup table.
 */
export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  // TEXT, not UUID — Better Auth generates its own (cuid-style) primary
  // keys for `user`, per plan/02-authentication.md §2.2.
  userId: text("user_id").unique().references(() => user.id),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  role: text("role").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),

  emailEncrypted: bytea("email_encrypted").notNull(),
  emailDomain: text("email_domain").notNull(),

  status: staffStatus("status").notNull().default("active"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  joinedAt: date("joined_at").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});
