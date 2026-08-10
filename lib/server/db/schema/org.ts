import { sql } from "drizzle-orm";
import { type AnyPgColumn, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { doctors } from "./people";

/**
 * docs/DATABASE.md §2.2. `head_id` is nullable and only backfilled once
 * doctors exist — see scripts/seed.ts pass 2. The reference is wrapped in a
 * callback (drizzle's standard pattern for a circular FK) because
 * departments and people reference each other across files.
 */
export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  headId: uuid("head_id").references((): AnyPgColumn => doctors.id),
  floor: text("floor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
