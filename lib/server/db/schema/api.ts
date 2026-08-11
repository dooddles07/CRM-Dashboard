import { sql } from "drizzle-orm";
import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { staff } from "./people";

/**
 * plan/05-http-api.md §4 and §6. The two tables the HTTP surface needs that
 * no screen does.
 */

/**
 * plan §4, verbatim.
 *
 * "A token inherits the role and department of the staff member it belongs
 * to, so RLS and the policy matrix apply unchanged. Scopes narrow further,
 * never widen." That is why there is no `role` column here: a token that
 * carried its own role would be a second place privileges are decided, and
 * the two would disagree the first time somebody changed a staff member's
 * role without thinking about their tokens.
 *
 * `token_hash` and never the token. plan §4: "the token is shown once, never
 * stored." Hashed with SHA-256 rather than argon2 for the same reason
 * lib/server/auth/tokens.ts gives: this is looked up by value on every
 * request, so it has to be a deterministic digest, and the input is 256 bits
 * of entropy rather than a human-chosen password — there is nothing for a
 * slow hash to defend against.
 *
 * **No token may hold `reveal`.** plan §4: "Automated bulk decryption is
 * exactly the threat docs/SECURITY.md §4 names as bulk exfiltration, and no
 * integration has a legitimate need." Enforced in
 * lib/server/api/tokens.ts rather than by a CHECK, because the scope
 * vocabulary lives in TypeScript.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_api_tokens_staff").on(table.staffId)],
);

/**
 * plan §6. Fixed-window counters.
 *
 * "Counted in Postgres with a fixed-window table, swept nightly. Redis would
 * be better and costs money. At this volume a small table with an index on
 * `(key, window_start)` is adequate, and the implementation is behind an
 * interface so swapping it later touches one file."
 *
 * A fixed window admits the classic burst at a boundary — 300 requests at
 * 11:59:59 and 300 more at 12:00:00. That is accepted deliberately: this is a
 * backstop against runaway clients, not a defence against a determined
 * attacker, who is handled by the reveal budget and by authentication. A
 * sliding window would need either a sorted set or a row per request, and
 * both cost more than the problem.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    /** `session:<id>`, `token:<id>`, or `ip:<address>` — see lib/server/api/rate-limit.ts. */
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    // The primary key *is* the index plan §6 asks for. A separate index on
    // (key, window_start) would duplicate it.
    primaryKey({ columns: [table.key, table.windowStart] }),
  ],
);
