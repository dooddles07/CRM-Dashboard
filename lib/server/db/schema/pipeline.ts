import { sql } from "drizzle-orm";
import { bigint, date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bytea } from "./columns";
import { leadStage, priority, referralStatus } from "./enums";
import { departments } from "./org";
import { patients, staff } from "./people";

/** docs/DATABASE.md §2.5, verbatim. */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  phoneEncrypted: bytea("phone_encrypted"),
  emailEncrypted: bytea("email_encrypted"),
  source: text("source").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  interest: text("interest"),
  stage: leadStage("stage").notNull().default("new"),
  ownerId: uuid("owner_id").references(() => staff.id),
  priority: priority("priority").notNull().default("medium"),
  valueCents: bigint("value_cents", { mode: "number" }).notNull().default(0),
  inquiry: text("inquiry"),
  convertedPatientId: uuid("converted_patient_id").references(() => patients.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  nextFollowUp: date("next_follow_up"),
});

export const leadStageHistory = pgTable("lead_stage_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  fromStage: leadStage("from_stage"),
  toStage: leadStage("to_stage").notNull(),
  movedBy: uuid("moved_by").references(() => staff.id),
  movedAt: timestamp("moved_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Not given explicit SQL in docs/DATABASE.md — authored per
 * plan/01-foundation.md §6.2. A referral arrives before the patient record
 * exists, so the join is by name at seed time; `patient_id` stays nullable
 * and `patient_name_raw` is kept permanently, not just as a migration
 * artefact, because unmatched referrals are a real ongoing state.
 */
export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull().unique(),
  patientId: uuid("patient_id").references(() => patients.id),
  patientNameRaw: text("patient_name_raw").notNull(),
  provider: text("provider").notNull(),
  providerType: text("provider_type").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  status: referralStatus("status").notNull().default("received"),
  ownerId: uuid("owner_id").references(() => staff.id),
  outcome: text("outcome"),
  valueCents: bigint("value_cents", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
