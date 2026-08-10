import { and, eq, isNull } from "drizzle-orm";
import { upsertCredentialAccount } from "./credentials";
import { generateToken, hashToken } from "./tokens";
import { db } from "@/lib/server/db";
import { auditLog } from "@/lib/server/db/audit-log";
import { passwordResetTokens, session as sessionTable, user } from "@/lib/server/db/schema/auth";
import { staff } from "@/lib/server/db/schema/people";
import { appBaseUrl, deliverSandboxLink } from "@/lib/server/comms/sandbox";

/**
 * plan/02-authentication.md §7. This deliberately does not route through
 * Better Auth's own built-in `/forgot-password` + `/reset-password`
 * endpoints (`node_modules/better-auth/dist/api/routes/password.mjs`):
 * those store their token via the generic `verification` table keyed as
 * `reset-password:${token}` and expect `emailAndPassword.sendResetPassword`
 * to be configured plus (per that route's own comments) a mounted
 * `/api/auth/[...all]` handler for the browser-facing callback redirect
 * flow — neither of which this codebase has (lib/server/auth/index.ts has
 * no `sendResetPassword` callback, and no route is mounted, see this
 * task's brief). Building a parallel, self-contained token flow here,
 * shaped like `invitations` (lib/server/db/schema/auth.ts's
 * `passwordResetTokens`), keeps this task's surface consistent with §2's
 * invitation flow instead of pulling in half of Better Auth's own
 * password-reset machinery for one call site.
 */
const RESET_TTL_MS = 60 * 60 * 1000; // plan §7: "1 hour expiry"

/**
 * plan §7 / task-3-brief.md §4, "Request reset." "The response is
 * identical whether the address is known or not" — this function returns
 * `void` either way, so the caller (Task 4's Server Action) has nothing to
 * branch on by construction; it must show the same "if an account exists…"
 * copy regardless.
 *
 * Timing: the found-user path does 2 awaited DB round trips after the
 * initial lookup (insert token, insert outbound message — 3 total
 * including the lookup). The not-found path performs the same *number* of
 * round trips against a real table (two dummy `SELECT`s) rather than
 * returning immediately after the lookup, so wall-clock time doesn't
 * reveal which branch ran — the same timing-oracle concern Task 2's lockout
 * closed for login (plan §5: "Compare against a dummy hash when no user is
 * found"), and the same shape Better Auth's own `/forgot-password`
 * endpoint uses for exactly this reason (its `requestPasswordReset`
 * handler runs `generateId(24)` plus a dummy
 * `internalAdapter.findVerificationValue()` call when the email doesn't
 * resolve — node_modules/better-auth/dist/api/routes/password.mjs). This
 * is a best-effort mitigation, not a cryptographic guarantee — same
 * caveat lib/server/auth/lockout.ts documents for its own timing-adjacent
 * de-duplication logic.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);

  if (!existingUser) {
    await dummyResetWork();
    return;
  }

  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  const [row] = await db
    .insert(passwordResetTokens)
    .values({ userId: existingUser.id, tokenHash, expiresAt })
    .returning({ id: passwordResetTokens.id });

  const link = `${appBaseUrl()}/reset-password?token=${token}`;
  await deliverSandboxLink({
    email,
    link,
    sourceKind: "password_reset",
    sourceId: row!.id,
    body: `Reset your CareFlow · St. Aurora password: ${link}`,
  });
}

async function dummyResetWork(): Promise<void> {
  const { tokenHash } = generateToken();
  await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
  await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
}

export type ConsumePasswordResetResult = { ok: true } | { ok: false };

/** Thrown to roll back `consumePasswordReset`'s transaction on a lost race against a concurrent consumption of the same token — mirrors `InvitationRaceError` in ./invitations.ts. */
class ResetRaceError extends Error {}

/**
 * plan §7 / task-3-brief.md §4, "Consume reset." Sets the new password,
 * marks the token used, deletes every session row for the user (plan §4's
 * "Rotation: new session id on ... password change", enforced here by
 * deletion rather than rotation since there is no session to rotate *into*
 * — the caller isn't authenticated), and writes one audit entry. Never
 * creates a session or touches `user.twoFactorEnabled` — "reset does not
 * bypass MFA" (plan §7): the user still signs in, TOTP included, same as
 * anyone else, afterward.
 */
export async function consumePasswordReset(params: { token: string; newPassword: string }): Promise<ConsumePasswordResetResult> {
  const tokenHash = hashToken(params.token);
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);

  if (!row) {
    console.debug("consumePasswordReset: no reset token matches this token");
    return { ok: false };
  }
  if (row.usedAt) {
    console.debug(`consumePasswordReset: token ${row.id} was already used`);
    return { ok: false };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    console.debug(`consumePasswordReset: token ${row.id} expired at ${row.expiresAt.toISOString()}`);
    return { ok: false };
  }

  try {
    await db.transaction(async (tx) => {
      // Re-check-and-claim inside the transaction — same race this
      // guards against as `acceptInvitation` in ./invitations.ts: two
      // concurrent consumptions of the same token could both pass the
      // pre-transaction reads above before either commits. Only the one
      // whose UPDATE actually flips a still-unused row proceeds.
      const [claimed] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)))
        .returning({ id: passwordResetTokens.id });
      if (!claimed) {
        throw new ResetRaceError();
      }

      await upsertCredentialAccount(tx, { userId: row.userId, password: params.newPassword });
      // plan §4/§7: "invalidates every active session on use" — deleted
      // outright rather than soft-invalidated, mirroring Better Auth's own
      // `resetPassword` handler's `internalAdapter.deleteUserSessions(userId)`
      // (see lib/server/auth/index.ts's `revokeSessionsOnPasswordReset`
      // comment) — this flow just performs the equivalent deletion by hand
      // since it doesn't go through that handler (see this file's header).
      await tx.delete(sessionTable).where(eq(sessionTable.userId, row.userId));

      const [staffRow] = await tx.select().from(staff).where(eq(staff.userId, row.userId)).limit(1);
      await tx.insert(auditLog).values({
        actorId: staffRow?.id ?? null,
        actorName: staffRow?.name ?? `Unknown staff (user ${row.userId})`,
        action: "updated",
        resourceType: "staff",
        resourceId: staffRow?.id ?? row.userId,
        field: "password",
      });
    });

    return { ok: true };
  } catch (err) {
    if (err instanceof ResetRaceError) {
      console.debug(`consumePasswordReset: token ${row.id} was claimed by a concurrent request`);
      return { ok: false };
    }
    throw err;
  }
}
