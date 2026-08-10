import { and, desc, eq, gte, or } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { auditLog } from "@/lib/server/db/audit-log";
import { authAttempts, user as userTable } from "@/lib/server/db/schema/auth";
import { staff } from "@/lib/server/db/schema/people";
import { notifications } from "@/lib/server/db/schema/system";

/**
 * plan/02-authentication.md §5's documented `auth_attempts.outcome` domain,
 * verbatim (lib/server/db/schema/auth.ts's column comment). `bad_totp` is
 * recorded by Task 4's /mfa Server Action, not by anything in this module —
 * plan §3.1: "Three failures reuse the lockout counter from §5", so the
 * same `recordAuthAttempt`/`checkLockout` pair below is what that action
 * calls too.
 */
export type AuthAttemptOutcome = "success" | "bad_password" | "bad_totp" | "locked";

const WINDOW_MS = 15 * 60 * 1000; // plan §5: "Failures in 15 minutes"
const DELAY_THRESHOLD = 5;
const DELAY_MS = 60 * 1000; // "5 -> 1 minute delay"
const LOCK_THRESHOLD = 10;
const LOCK_MS = 15 * 60 * 1000; // "10 -> 15 minute lock"
const ADMIN_LOCK_THRESHOLD = 15; // "15 -> Locked until a Hospital Admin clears it"

export type LockoutConsequence =
  | { kind: "none" }
  | { kind: "delay"; retryAt: Date }
  | { kind: "locked"; retryAt: Date }
  | { kind: "admin_lock" };

const SEVERITY: Record<LockoutConsequence["kind"], number> = {
  none: 0,
  delay: 1,
  locked: 2,
  admin_lock: 3,
};

/**
 * Records one login/MFA attempt. `email` is whatever the caller submitted
 * on the form, recorded as-is regardless of whether it resolves to a real
 * account — plan §5's timing-safety requirement ("Responses stay identical
 * whether the account exists or not") extends to lockout bookkeeping: a
 * nonexistent email accumulating failures and eventually locking behaves
 * identically to a real one, so lockout state itself can't be used to
 * enumerate accounts.
 *
 * Returns the consequence that applies *after* this attempt is recorded
 * (same computation `checkLockout` does), and — only on the exact attempt
 * that newly crosses the 10- or 15-failure threshold, and only when the
 * email resolves to a real `staff` account — writes the audit entry and
 * Hospital Admin notifications plan §5 requires. See `maybeAuditLock`'s
 * comment for why a non-resolving email is not audited.
 */
export async function recordAuthAttempt(params: {
  email: string | null;
  ip: string;
  outcome: AuthAttemptOutcome;
}): Promise<LockoutConsequence> {
  const { email, ip, outcome } = params;
  const before = await checkLockout({ email, ip });
  await db.insert(authAttempts).values({ email, ip, outcome });
  const after = await checkLockout({ email, ip });

  const justEscalatedToLock =
    outcome !== "success" &&
    SEVERITY[after.kind] > SEVERITY[before.kind] &&
    (after.kind === "locked" || after.kind === "admin_lock");
  if (justEscalatedToLock) {
    await maybeAuditLock({ email, ip });
  }

  return after;
}

/**
 * Checks both counters (plan §5: "counted twice — per account and per IP")
 * independently against the trailing 15-minute window and returns the more
 * severe of the two consequences. Consequence durations (1 minute / 15
 * minutes) are computed from the most recent qualifying failure in the
 * winning counter, not from the window boundary itself — a fixed cooldown
 * from the last failure, which is the standard progressive-lockout shape
 * and matches the plan's "N failures -> Y-long consequence" phrasing more
 * literally than treating Y as an artifact of the 15-minute counting
 * window. See task-2-report.md for this being a judgment call, not
 * something the plan pins down unambiguously.
 */
export async function checkLockout(params: { email: string | null; ip: string }): Promise<LockoutConsequence> {
  const [byEmail, byIp] = await Promise.all([
    params.email ? windowStats(authAttempts.email, params.email) : Promise.resolve({ count: 0, mostRecentAt: null }),
    windowStats(authAttempts.ip, params.ip),
  ]);

  const emailConsequence = consequenceForCount(byEmail.count, byEmail.mostRecentAt);
  const ipConsequence = consequenceForCount(byIp.count, byIp.mostRecentAt);

  return SEVERITY[emailConsequence.kind] >= SEVERITY[ipConsequence.kind] ? emailConsequence : ipConsequence;
}

async function windowStats(
  column: typeof authAttempts.email | typeof authAttempts.ip,
  value: string,
): Promise<{ count: number; mostRecentAt: Date | null }> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .select({ at: authAttempts.at })
    .from(authAttempts)
    // drizzle-orm's `eq` is fine against either column at runtime; the
    // overload picked here is whichever the caller passed.
    .where(and(eq(column, value), gte(authAttempts.at, windowStart), failureOutcomeFilter()))
    .orderBy(desc(authAttempts.at));
  return { count: rows.length, mostRecentAt: rows[0]?.at ?? null };
}

function failureOutcomeFilter() {
  // `outcome IN ('bad_password', 'bad_totp')` — `locked` rows are the
  // recorded consequence of an already-locked attempt, not a fresh
  // credential failure, so they don't compound the count further, and a
  // `success` row obviously shouldn't either.
  return or(eq(authAttempts.outcome, "bad_password"), eq(authAttempts.outcome, "bad_totp"));
}

function consequenceForCount(count: number, mostRecentAt: Date | null): LockoutConsequence {
  if (count >= ADMIN_LOCK_THRESHOLD) return { kind: "admin_lock" };
  const anchor = mostRecentAt?.getTime() ?? Date.now();
  if (count >= LOCK_THRESHOLD) return { kind: "locked", retryAt: new Date(anchor + LOCK_MS) };
  if (count >= DELAY_THRESHOLD) return { kind: "delay", retryAt: new Date(anchor + DELAY_MS) };
  return { kind: "none" };
}

/**
 * plan §5: "Every lock writes an audit entry and a `security` notification
 * to Hospital Admins." `audit_log.actor_id` is `NOT NULL REFERENCES
 * staff(id)` (docs/DATABASE.md §2.7, drizzle/manual/0002_audit_log.sql) —
 * there is no "system" or "anonymous" actor to attribute an audit entry to.
 * When the locked email doesn't resolve to a real `user` + `staff` pair
 * (an attack against a nonexistent or not-yet-provisioned address), this
 * intentionally skips the audit/notification writes rather than weakening
 * that constraint: the lockout *behaviour* (refusing further attempts)
 * still applies identically either way per `checkLockout`, so nothing
 * about account existence leaks from whether an admin gets notified — only
 * the admins themselves would ever see that difference, and only by
 * comparing it against the `auth_attempts` rows directly, which is exactly
 * the audit trail plan §5 wants them to have.
 */
async function maybeAuditLock(params: { email: string | null; ip: string }): Promise<void> {
  if (!params.email) return;

  const [userRow] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, params.email))
    .limit(1);
  if (!userRow) return;

  const [staffRow] = await db.select().from(staff).where(eq(staff.userId, userRow.id)).limit(1);
  if (!staffRow) return; // same invariant as lib/server/auth/index.ts's session hook

  await db.insert(auditLog).values({
    actorId: staffRow.id,
    actorName: staffRow.name,
    action: "locked",
    resourceType: "staff",
    resourceId: staffRow.id,
    ipAddress: params.ip,
  });

  const admins = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.role, "Hospital Admin"), eq(staff.status, "active")));
  if (admins.length === 0) return;

  await db.insert(notifications).values(
    admins.map((admin) => ({
      staffId: admin.id,
      category: "security" as const,
      title: "Account locked after repeated failed sign-ins",
      body: `${staffRow.name} · ${params.ip} · locked per plan §5's lockout thresholds.`,
      href: "/admin/security",
      tone: "danger" as const,
    })),
  );
}
