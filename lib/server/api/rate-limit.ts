import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { rateLimits } from "@/lib/server/db/schema/api";
import { RateLimitError } from "@/lib/server/services/errors";

/**
 * plan/05-http-api.md §6. Fixed-window rate limiting, counted in Postgres.
 *
 * "Redis would be better and costs money. At this volume a small table with
 * an index on `(key, window_start)` is adequate, and the implementation is
 * behind an interface so swapping it later touches one file." This is that
 * file, and `consume` is that interface.
 *
 * A fixed window admits the boundary burst — 300 requests at 11:59:59 and 300
 * more at 12:00:00 is 600 in two seconds. Accepted deliberately: this is a
 * backstop against a runaway client, not a defence against a determined
 * attacker. The reveal budget (Phase 04 §5.1) is the strict limit, and it is
 * counted differently precisely because it guards something that matters.
 */

export const LIMITS = {
  /** plan §6: per session, all endpoints. */
  session: { max: 300, windowSeconds: 60 },
  /** Lower for machines: an integration should be predictable, a human is bursty. */
  token: { max: 60, windowSeconds: 60 },
  /** Unauthenticated surfaces — sign-in, password reset. */
  ip: { max: 10, windowSeconds: 60 },
} as const;

export type LimitKind = keyof typeof LIMITS;

/**
 * Counts one request against a key and throws when the window is full.
 *
 * The insert-or-increment is a single statement so two concurrent requests
 * cannot both read 299 and both write 300. `ON CONFLICT DO UPDATE` makes the
 * row's own lock do the serialising, which is the cheapest correct option
 * here — a read-then-write would need an explicit lock or a retry loop.
 *
 * Runs on `db`, outside `withSession`. Rate limiting decides whether a
 * request may proceed *at all*, so it happens before any session context is
 * declared, and `rate_limits` carries no row-level security for that reason.
 * There is nothing personal in it: a key, a timestamp, a count.
 */
export async function consume(kind: LimitKind, identifier: string): Promise<void> {
  const limit = LIMITS[kind];
  const key = `${kind}:${identifier}`;
  const windowStart = new Date(
    Math.floor(Date.now() / (limit.windowSeconds * 1000)) * limit.windowSeconds * 1000,
  );

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  if (row && row.count > limit.max) {
    const retryAfter = Math.ceil(
      (windowStart.getTime() + limit.windowSeconds * 1000 - Date.now()) / 1000,
    );
    throw new RateLimitError("RATE_EXCEEDED", "Too many requests. Try again in a moment.", {
      limit: limit.max,
      windowSeconds: limit.windowSeconds,
      retryAfter: Math.max(1, retryAfter),
    });
  }
}

/**
 * plan §6: "swept nightly". Phase 07's scheduler calls this.
 *
 * Deletes windows that have closed. Without it the table grows by one row per
 * key per minute forever, which on a free tier is the kind of slow leak that
 * is invisible until the storage limit arrives.
 */
export async function sweep(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const result = await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
  return result.rowCount ?? 0;
}

/** Current count for a key in its live window. For tests and the health check. */
export async function peek(kind: LimitKind, identifier: string): Promise<number> {
  const limit = LIMITS[kind];
  const windowStart = new Date(
    Math.floor(Date.now() / (limit.windowSeconds * 1000)) * limit.windowSeconds * 1000,
  );
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, `${kind}:${identifier}`), eq(rateLimits.windowStart, windowStart)))
    .limit(1);
  return row?.count ?? 0;
}
