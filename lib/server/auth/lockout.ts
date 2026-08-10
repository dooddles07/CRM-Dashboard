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

function isLockedKind(kind: LockoutConsequence["kind"]): boolean {
  return kind === "locked" || kind === "admin_lock";
}

interface CounterState {
  count: number;
  mostRecentAt: Date | null;
  consequence: LockoutConsequence;
}

/**
 * Records one login/MFA attempt. `email` is whatever the caller submitted
 * on the form, recorded as-is regardless of whether it resolves to a real
 * account — plan §5's timing-safety requirement ("Responses stay identical
 * whether the account exists or not") extends to lockout bookkeeping: a
 * nonexistent email accumulating failures and eventually locking behaves
 * identically to a real one, so lockout state itself can't be used to
 * enumerate accounts.
 *
 * Returns the consequence that applies *after* this attempt is recorded,
 * and — the first time (per lock episode) the combined consequence reaches
 * "locked"/"admin_lock" — writes the audit entry and Hospital Admin
 * notifications plan §5 requires. See `auditLockOnce` for attribution and
 * de-duplication.
 */
export async function recordAuthAttempt(params: {
  email: string | null;
  ip: string;
  outcome: AuthAttemptOutcome;
}): Promise<LockoutConsequence> {
  const { email, ip, outcome } = params;
  await db.insert(authAttempts).values({ email, ip, outcome });
  const { email: emailState, combined } = await evaluateCounters(email, ip);

  if (outcome !== "success" && isLockedKind(combined.kind)) {
    // Review finding #1: attribute by which counter actually crossed, not
    // by whichever account this request happened to be about. If the
    // email's *own* count independently reached a lock-worthy tier, this
    // account is genuinely being targeted (even if the IP counter is also
    // high — e.g. one attacker hammering one account from one address).
    // Otherwise the account's own count is still low and the combined
    // "locked" verdict is a side effect of this IP's aggregate activity,
    // plausibly spread across many different accounts — attributing that
    // to whichever account happened to be hit last would misrepresent a
    // password-spray as a single-account brute-force in the audit trail.
    const source: "email" | "ip" = isLockedKind(emailState.consequence.kind) ? "email" : "ip";
    await auditLockOnce({ email, ip, source });
  }

  return combined;
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
  const { combined } = await evaluateCounters(params.email, params.ip);
  return combined;
}

/**
 * Shared by `checkLockout` (public: "what happens to this attempt") and
 * `recordAuthAttempt` (needs the per-counter breakdown too, to attribute a
 * lock correctly — review finding #1).
 */
async function evaluateCounters(
  email: string | null,
  ip: string,
): Promise<{ email: CounterState; ip: CounterState; combined: LockoutConsequence }> {
  const [byEmail, byIp] = await Promise.all([
    email ? windowStats(authAttempts.email, email) : Promise.resolve({ count: 0, mostRecentAt: null }),
    windowStats(authAttempts.ip, ip),
  ]);

  const emailState: CounterState = { ...byEmail, consequence: consequenceForCount(byEmail.count, byEmail.mostRecentAt) };
  const ipState: CounterState = { ...byIp, consequence: consequenceForCount(byIp.count, byIp.mostRecentAt) };
  const combined = SEVERITY[emailState.consequence.kind] >= SEVERITY[ipState.consequence.kind]
    ? emailState.consequence
    : ipState.consequence;

  return { email: emailState, ip: ipState, combined };
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

interface AuditTarget {
  actorId: string | null;
  actorName: string;
  resourceType: string;
  resourceId: string;
}

/**
 * plan §5: "Every lock writes an audit entry and a `security` notification
 * to Hospital Admins." Writes at most once per lock episode (review finding
 * #3) and attributes correctly by source (review finding #1).
 *
 * De-duplication is a best-effort guard, not a hard transactional one:
 * `alreadyAudited` checks for a matching `locked` row before inserting.
 * Two requests that both cross the threshold in the same instant can still
 * both pass that check before either has inserted — the brief's own framing
 * ("doesn't need to be elaborate") is why this doesn't reach for an
 * advisory lock or a `SELECT ... FOR UPDATE`; a duplicate audit row in that
 * narrow race is a cosmetic risk (an extra, identical, non-misleading row —
 * finding #1's misattribution risk is what actually mattered), not a
 * correctness one, since the lockout *behaviour* itself doesn't depend on
 * this write succeeding exactly once.
 */
async function auditLockOnce(params: { email: string | null; ip: string; source: "email" | "ip" }): Promise<void> {
  const target = await resolveAuditTarget(params);
  if (await alreadyAudited(target)) return;

  await db.insert(auditLog).values({
    actorId: target.actorId,
    actorName: target.actorName,
    action: "locked",
    resourceType: target.resourceType,
    resourceId: target.resourceId,
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
      body: `${target.actorName} · ${params.ip} · locked per plan §5's lockout thresholds.`,
      href: "/admin/security",
      tone: "danger" as const,
    })),
  );
}

/**
 * Resolves who/what a lock audit entry should be attributed to.
 *
 * `source: "ip"` (review finding #1) — the account's own failure count is
 * still below the lock threshold; the combined "locked" verdict came from
 * this IP's aggregate activity, which may span several different accounts.
 * Attributed to the IP itself (`actor_id` null, `resource_type` "ip"), not
 * to whichever account this particular request happened to name.
 *
 * `source: "email"` — the account's own count crossed the threshold, a
 * genuine targeted attack on that specific address. Resolved through
 * `user`/`staff` the same way the staff-resolution invariant does
 * elsewhere (./index.ts, ./session.ts). If it resolves to a real `staff`
 * row, attributed there. If it doesn't (review finding #2) — an attack
 * against a dead or not-yet-provisioned address — `actor_id` is `NULL`
 * (drizzle/manual/0006_audit_log_actor_nullable.sql) and `actor_name`
 * carries the attempted email instead, so the audit trail still records
 * that the address was probed, which is the whole point: losing that
 * record would hide a real reconnaissance signal from the Hospital Admins
 * plan §5 is writing this for.
 */
async function resolveAuditTarget(params: { email: string | null; ip: string; source: "email" | "ip" }): Promise<AuditTarget> {
  if (params.source === "ip") {
    return {
      actorId: null,
      actorName: `Multiple accounts (IP-driven lockout from ${params.ip})`,
      resourceType: "ip",
      resourceId: params.ip,
    };
  }

  if (params.email) {
    const [userRow] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, params.email)).limit(1);
    if (userRow) {
      const [staffRow] = await db.select().from(staff).where(eq(staff.userId, userRow.id)).limit(1);
      if (staffRow) {
        return { actorId: staffRow.id, actorName: staffRow.name, resourceType: "staff", resourceId: staffRow.id };
      }
    }
  }

  return {
    actorId: null,
    actorName: `Unknown account (${params.email ?? "no email submitted"})`,
    resourceType: "staff",
    resourceId: params.email ?? params.ip,
  };
}

/**
 * Whether a "locked" audit entry already exists for this exact target
 * within the current 15-minute counting window — the de-duplication half
 * of review finding #3. Keying on `(resourceType, resourceId)` rather than
 * `actorId` is what lets two different unresolved emails (both `actorId:
 * null`) get their own separate entries while still deduping repeat writes
 * against the *same* unresolved email or the *same* attacking IP.
 */
async function alreadyAudited(target: Pick<AuditTarget, "resourceType" | "resourceId">): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const [row] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "locked"),
        eq(auditLog.resourceType, target.resourceType),
        eq(auditLog.resourceId, target.resourceId),
        gte(auditLog.occurredAt, windowStart),
      ),
    )
    .limit(1);
  return !!row;
}
