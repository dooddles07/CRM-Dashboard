import { drizzle } from "drizzle-orm/neon-serverless";
import { auditLog } from "./audit-log";
import * as schemaTables from "./schema";

// auditLog is merged in here rather than re-exported from ./schema, so
// that drizzle-kit generate (which scans lib/server/db/schema/*.ts) never
// sees it — see lib/server/db/schema/system.ts for why.
const schema = { ...schemaTables, auditLog };

/**
 * plan/01-foundation.md §8. Uses the Neon serverless driver rather than
 * `node-postgres`: serverless invocations must not hold connections
 * between requests, and this driver's pooled HTTP endpoint does not.
 *
 * Queries needing a transaction — every write, and every read that sets
 * RLS context — go through the helper introduced in Phase 03 rather than
 * calling `db` directly.
 */
export function createDb(url: string) {
  return drizzle(url, { schema });
}

/**
 * The application's connection — every request-serving consumer goes
 * through this one export, so that setting the RLS session context
 * (Phase 03) has a single place to live. Bound to the pooled URL per §1.1
 * ("everything else uses the pooled one"). Migrations and scripts/seed.ts
 * are the two exceptions §1.1 calls out — they build their own instance
 * from `createDb(DATABASE_URL_UNPOOLED)` instead of importing this.
 */
export const db = createDb(process.env.DATABASE_URL!);

export type Database = typeof db;
