import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { AuthzSession } from "@/lib/server/authz/policy";
import { withSession } from "@/lib/server/db/session";
import { notifications } from "@/lib/server/db/schema/system";
import { fromDbEnum } from "@/lib/server/db/enum-map";
import type { NotificationCategory, Tone } from "@/lib/types";

/**
 * plan/04-service-layer.md §9: "Per staff member."
 *
 * The only service with no `assert` call, and the omission is deliberate
 * rather than an oversight. The seven areas in the matrix describe records
 * that belong to the hospital; a notification belongs to one person. There is
 * no role that may read another person's notifications and none that may not
 * read their own, so an area/level check would have nothing to say.
 *
 * Scope is enforced entirely by Postgres — `notifications_own` in
 * drizzle/manual/0007_row_level_security.sql restricts every statement to
 * `staff_id = app_staff_id()`. That is why these functions contain no
 * `WHERE staff_id = ...`: adding one would imply the policy might not hold,
 * and a reader would not know which of the two was load-bearing. The policy
 * is. `scripts/policy-tests.ts` asserts a staff member sees their own and
 * none of anyone else's.
 */

export interface NotificationDTO {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href: string;
  tone: Tone;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  /** Unread only. The rail badge wants a count, not a page. */
  unreadOnly?: boolean;
  limit?: number;
}

const MAX_LIMIT = 50;

export async function list(
  session: AuthzSession,
  filters: NotificationFilters = {},
): Promise<NotificationDTO[]> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(filters.limit ?? 20)));

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({
        id: notifications.id,
        category: notifications.category,
        title: notifications.title,
        body: notifications.body,
        href: notifications.href,
        tone: notifications.tone,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(filters.unreadOnly ? isNull(notifications.readAt) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      category: fromDbEnum(row.category) as NotificationCategory,
      title: row.title,
      body: row.body,
      href: row.href,
      tone: fromDbEnum(row.tone) as Tone,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

/** The rail badge. Counted rather than fetched, since the badge shows a number. */
export async function unreadCount(session: AuthzSession): Promise<number> {
  return withSession(session, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(isNull(notifications.readAt));
    return row?.n ?? 0;
  });
}

/**
 * No audit entry. Reading your own notification is not a disclosure of anyone
 * else's data, and plan §4.2 records `viewed` for patient records
 * specifically — logging every badge dismissal would bury the entries that
 * matter, which is the same argument that keeps list views out of the log.
 */
export async function markRead(session: AuthzSession, id: string): Promise<void> {
  await withSession(session, async (tx) => {
    await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), isNull(notifications.readAt)));
  });
}

export async function markAllRead(session: AuthzSession): Promise<number> {
  return withSession(session, async (tx) => {
    const result = await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(isNull(notifications.readAt));
    return result.rowCount ?? 0;
  });
}
