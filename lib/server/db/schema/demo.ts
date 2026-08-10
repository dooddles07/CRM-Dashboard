import { integer, pgTable, primaryKey, text, time, uuid } from "drizzle-orm/pg-core";

/**
 * plan/01-foundation.md §7.2, verbatim. Seeded once, per row, at seed time
 * — never touched again by hand. The nightly re-anchor job recomputes
 * `starts_at` (or the relevant date column) from `day_offset` against the
 * real calendar, so the demo dataset keeps looking alive without
 * accumulating the drift that shifting rows forward would cause. Rows a
 * user creates carry no anchor and are therefore never touched — that is
 * what protects real work from the demo scaffolding (audit risk R7).
 *
 * Drop this table and its nightly job (Phase 07) once the product carries
 * real records. Nothing else references it.
 */
export const seedAnchor = pgTable(
  "seed_anchor",
  {
    tableName: text("table_name").notNull(),
    rowId: uuid("row_id").notNull(),
    dayOffset: integer("day_offset").notNull(),
    timeOfDay: time("time_of_day"),
  },
  (table) => [primaryKey({ columns: [table.tableName, table.rowId] })],
);
