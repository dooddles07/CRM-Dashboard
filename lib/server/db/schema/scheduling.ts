import { sql } from "drizzle-orm";
import { index, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appointmentStatus, channel } from "./enums";
import { departments } from "./org";
import { doctors, patients } from "./people";

/**
 * docs/DATABASE.md §2.4. The seed model splits date and start; here they
 * collapse into one `starts_at` (see plan/01-foundation.md §6.2 for the
 * Asia/Manila conversion the seed must apply).
 *
 * The no-double-booking exclusion constraint cannot be expressed in
 * Drizzle's schema DSL — it lives in drizzle/manual/0001_no_double_booking.sql
 * per plan §5, applied alongside the generated migration for this table.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    type: text("type").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: smallint("duration_minutes").notNull(),
    location: text("location"),
    status: appointmentStatus("status").notNull().default("requested"),
    reason: text("reason"),
    notes: text("notes"),
    reminderChannel: channel("reminder_channel"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_appt_starts").on(table.startsAt),
    index("idx_appt_doctor").on(table.doctorId, table.startsAt),
    index("idx_appt_patient").on(table.patientId, table.startsAt.desc()),
  ],
);
