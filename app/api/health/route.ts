import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

/**
 * plan/05-http-api.md §5.1: "Liveness, database reachability, next audit
 * partition present, queue depth. Phase 09."
 *
 * Liveness and reachability now; queue depth arrives with the queue. The
 * audit partition check is here rather than deferred because it is the one
 * that fails silently and destructively: `audit_log` is partitioned by range,
 * and an insert for a timestamp beyond the last partition raises — meaning
 * every audited action, including every reveal, starts failing the moment the
 * calendar passes the final partition's upper bound.
 *
 * Unauthenticated by design: a monitor cannot hold a session. It therefore
 * reports states, never contents — no counts, no names, no versions.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "degraded" | "failing"> = {
    database: "failing",
    auditPartition: "failing",
  };

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";

    // Is there a partition covering a month from now?
    const result = await db.execute<{ covered: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_inherits i ON i.inhrelid = c.oid
        WHERE i.inhparent = 'audit_log'::regclass
          AND pg_get_expr(c.relpartbound, c.oid) LIKE '%' || to_char(now() + interval '30 days', 'YYYY') || '%'
      ) AS covered
    `);
    checks.auditPartition = result.rows[0]?.covered ? "ok" : "degraded";
  } catch {
    // Deliberately swallowed. A health endpoint that returns a stack trace to
    // an unauthenticated caller is an information leak; the status is the
    // whole message.
  }

  const healthy = Object.values(checks).every((state) => state === "ok");
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503 },
  );
}
