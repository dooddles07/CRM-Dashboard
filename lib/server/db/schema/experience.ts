import { sql } from "drizzle-orm";
import { index, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { caseStatus, feedbackStatus, priority } from "./enums";
import { departments } from "./org";
import { doctors, patients, staff } from "./people";

/** docs/DATABASE.md §2.6, verbatim. */
export const complaints = pgTable(
  "complaints",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    departmentId: uuid("department_id").references(() => departments.id),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull(),
    ownerId: uuid("owner_id").references(() => staff.id),
    priority: priority("priority").notNull().default("medium"),
    status: caseStatus("status").notNull().default("new"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
  },
  (table) => [
    index("idx_complaints_open_sla")
      .on(table.slaDueAt)
      .where(sql`${table.status} IN ('new','assigned','investigating','waiting')`),
  ],
);

/**
 * Not given explicit SQL in docs/DATABASE.md — authored from the `Feedback`
 * interface in lib/types.ts, following the same conventions as complaints.
 */
export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  departmentId: uuid("department_id").references(() => departments.id),
  doctorId: uuid("doctor_id").references(() => doctors.id),
  rating: smallint("rating").notNull(),
  category: text("category").notNull(),
  comment: text("comment"),
  status: feedbackStatus("status").notNull().default("new"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});
