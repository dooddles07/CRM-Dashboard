import { and, eq, gt, isNull } from "drizzle-orm";
import { createBareUser, hasCredentialAccount, initialsFromName, upsertCredentialAccount } from "./credentials";
import { isKnownStaffRole } from "./roles";
import { generateToken, hashToken } from "./tokens";
import { db } from "@/lib/server/db";
import { auditLog } from "@/lib/server/db/audit-log";
import { invitations, user } from "@/lib/server/db/schema/auth";
import { staff } from "@/lib/server/db/schema/people";
import { generateReference } from "@/lib/server/db/reference";
import { emailDomainOf, encryptPiiRequired } from "@/lib/server/db/pii";
import { appBaseUrl, deliverSandboxLink } from "@/lib/server/comms/sandbox";

/** plan/02-authentication.md §6.2: "Expires in 72 hours." */
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

export interface CreateInvitationParams {
  email: string;
  role: string;
  departmentId?: string | null;
  /** `staff.id` of the inviting staff member — the caller resolves this via `requireSession()` before calling in (task-3-brief.md §2). */
  invitedByStaffId: string;
}

export interface CreateInvitationResult {
  invitationId: string;
  /** Plaintext token, already embedded in `link` — returned too in case a caller (e.g. `scripts/provision.ts`) needs it directly. */
  token: string;
  link: string;
  expiresAt: Date;
}

/**
 * task-3-brief.md §2, "Create an invitation." Validates `role` against the
 * known set (lib/server/auth/roles.ts), which as of Phase 03 is the nine-role
 * matrix itself — so an invitation can no longer name a role enforcement has
 * never heard of, and "Doctor" is now invitable where it previously wasn't.
 * Does not validate `departmentId` beyond the table's own FK — an invalid id fails
 * loudly as a Postgres foreign-key violation, which is enough given Task 4
 * is expected to populate this from a real department picker, not free text.
 *
 * Fix round (code review, Critical finding): also refuses to issue an
 * invitation for an email that already resolves to an active account —
 * either a `user` with a `credential` account already attached, or a
 * `staff` row whose `status` isn't `'invited'` (covers a staff row that
 * was suspended before ever completing its own bootstrap, which wouldn't
 * have a credential yet either). A legitimate "I forgot my password" case
 * has its own flow (`requestPasswordReset`/`consumePasswordReset`); a
 * fresh invitation has no legitimate purpose against an email that's
 * already onboarded, and closing this off at creation time is
 * defense-in-depth alongside the same check `acceptInvitation` now makes
 * before it will touch an existing user's credential.
 */
export async function createInvitation(params: CreateInvitationParams): Promise<CreateInvitationResult> {
  if (!isKnownStaffRole(params.role)) {
    throw new Error(`createInvitation: unknown role "${params.role}"`);
  }

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, params.email)).limit(1);
  if (existingUser) {
    const [existingStaff] = await db.select({ status: staff.status }).from(staff).where(eq(staff.userId, existingUser.id)).limit(1);
    const alreadyOnboarded = (await hasCredentialAccount(db, existingUser.id)) || (existingStaff !== undefined && existingStaff.status !== "invited");
    if (alreadyOnboarded) {
      throw new Error(`createInvitation: ${params.email} already has an active account and cannot be re-invited`);
    }
  }

  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const [row] = await db
    .insert(invitations)
    .values({
      email: params.email,
      role: params.role,
      departmentId: params.departmentId ?? null,
      tokenHash,
      invitedBy: params.invitedByStaffId,
      expiresAt,
    })
    .returning({ id: invitations.id });

  const link = `${appBaseUrl()}/accept-invite?token=${token}`;
  await deliverSandboxLink({
    email: params.email,
    link,
    sourceKind: "invitation",
    sourceId: row!.id,
    body: `You've been invited to CareFlow · St. Aurora. Set up your account: ${link}`,
  });

  return { invitationId: row!.id, token, link, expiresAt };
}

/** task-3-brief.md §2, "Revoke an invitation." Idempotent: a second call on an already-revoked row is a no-op rather than re-stamping `revokedAt`. */
export async function revokeInvitation(invitationId: string): Promise<void> {
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, invitationId), isNull(invitations.revokedAt)));
}

export type AcceptInvitationResult =
  | { ok: true; userId: string; staffId: string }
  | { ok: false };

/** Thrown to roll back `acceptInvitation`'s transaction when a concurrent request already claimed the invitation between the pre-transaction check and this transaction's own update — see the comment at its throw site. */
class InvitationRaceError extends Error {}

/** Thrown to roll back `acceptInvitation`'s transaction when the invitation's email already resolves to an active, credentialed (or non-'invited') account — see `hasCredentialAccount`'s header comment in ./credentials.ts. */
class InvitationTakeoverError extends Error {}

/**
 * task-3-brief.md §2, "Accept an invitation." Identical-shaped rejection
 * for expired / already-accepted / already-revoked / not-found — the brief
 * doesn't ask the plan to distinguish them to the caller, only that "you
 * may log which internally", hence the `console.debug` below rather than a
 * `reason` field on the return type.
 *
 * One transaction covers everything plan §6.2 lists ("set the password,
 * ... create the staff row, mark the invitation accepted, write the audit
 * entry") except TOTP enrolment, which task-3-brief.md explicitly defers
 * to Task 4's `/accept-invite` UI ("there's no code entering it here").
 *
 * Handles two shapes under one contract (task-3-brief.md §1's "Use your
 * judgment" on how provisioning reuses this):
 *  - the ordinary case: no `user` row exists yet for `invitation.email` —
 *    creates one (`createBareUser` + `upsertCredentialAccount`) and a new
 *    `staff` row from the invitation's `role`/`departmentId`.
 *  - the provisioning-bootstrap case: `scripts/provision.ts` already
 *    created both the `user` and its `staff` row directly (no inviter
 *    exists yet at that point) and then called `createInvitation` against
 *    that same email purely to drive this "set your password" step. Here,
 *    the existing `user` gets its first `account` row instead of a new
 *    `user`, and the existing `staff` row is left alone apart from
 *    flipping `status` from `'invited'` to `'active'` — the same
 *    transition the ordinary path reaches by inserting `status: 'active'`
 *    directly, so both entry points converge on "staff row exists and is
 *    active" by the time this returns.
 */
export async function acceptInvitation(params: {
  token: string;
  password: string;
  /** Only used when no `user` row exists yet for the invitation's email — ignored for the provisioning-bootstrap case, whose `user.name` was already set at `npm run provision` time. */
  name: string;
}): Promise<AcceptInvitationResult> {
  const tokenHash = hashToken(params.token);
  const [invitation] = await db.select().from(invitations).where(eq(invitations.tokenHash, tokenHash)).limit(1);

  if (!invitation) {
    console.debug("acceptInvitation: no invitation matches this token");
    return { ok: false };
  }
  if (invitation.revokedAt) {
    console.debug(`acceptInvitation: invitation ${invitation.id} was revoked`);
    return { ok: false };
  }
  if (invitation.acceptedAt) {
    console.debug(`acceptInvitation: invitation ${invitation.id} was already accepted`);
    return { ok: false };
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    console.debug(`acceptInvitation: invitation ${invitation.id} expired at ${invitation.expiresAt.toISOString()}`);
    return { ok: false };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Re-check-and-claim inside the transaction, not just the
      // pre-transaction reads above: two concurrent acceptances of the
      // same token could both pass those checks before either commits.
      // Only the request whose UPDATE actually flips a still-unaccepted,
      // unrevoked row wins; the other throws and rolls back everything it
      // did in this same transaction (user/account/staff), so a lost race
      // never leaves a stray half-created account behind — "an invitation
      // link works once and is dead the second time" (plan §9).
      const [claimed] = await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(
          and(
            eq(invitations.id, invitation.id),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            // Minor fix-round item: re-check expiry inside the claim too —
            // the pre-transaction read above can't catch a token expiring
            // in the narrow window between that read and this UPDATE.
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .returning({ id: invitations.id });
      if (!claimed) {
        throw new InvitationRaceError();
      }

      const [existingUser] = await tx.select().from(user).where(eq(user.email, invitation.email)).limit(1);

      let userId: string;
      if (existingUser) {
        userId = existingUser.id;
      } else {
        ({ userId } = await createBareUser(tx, { email: invitation.email, name: params.name }));
      }

      const [existingStaff] = await tx.select().from(staff).where(eq(staff.userId, userId)).limit(1);

      if (existingUser) {
        // Critical fix-round finding: a user created moments ago by
        // `createBareUser` above cannot yet have a credential or a
        // non-'invited' staff row, so this guard only applies to a
        // *pre-existing* user — exactly the provisioning-bootstrap case
        // this function is meant to also handle (task-3-brief.md §1) vs.
        // an already-onboarded account this invitation has no business
        // touching. Without it, a fresh invitation issued (by mistake or
        // by a malicious insider with invite access) against an
        // already-active email would let anyone holding that token
        // silently overwrite that account's password.
        const alreadyCredentialed = await hasCredentialAccount(tx, userId);
        const staffNotPending = existingStaff !== undefined && existingStaff.status !== "invited";
        if (alreadyCredentialed || staffNotPending) {
          throw new InvitationTakeoverError();
        }
      }

      await upsertCredentialAccount(tx, { userId, password: params.password });

      let staffId: string;
      let actorName: string;
      let auditAction: "created" | "updated";
      let auditField: string | null;
      if (existingStaff) {
        // Provisioning-bootstrap path (task-3-brief.md §1): role/department
        // were already correct when `scripts/provision.ts` created this row.
        staffId = existingStaff.id;
        actorName = existingStaff.name;
        auditAction = "updated";
        auditField = "status";
        await tx.update(staff).set({ status: "active", updatedAt: new Date() }).where(eq(staff.id, existingStaff.id));
      } else {
        const reference = await generateReference("staff", async (candidate) => {
          const [existingRef] = await tx.select({ id: staff.id }).from(staff).where(eq(staff.reference, candidate)).limit(1);
          return !!existingRef;
        });
        const [createdStaff] = await tx
          .insert(staff)
          .values({
            reference,
            userId,
            name: params.name,
            initials: initialsFromName(params.name),
            role: invitation.role,
            departmentId: invitation.departmentId,
            emailEncrypted: encryptPiiRequired(invitation.email),
            emailDomain: emailDomainOf(invitation.email),
            status: "active",
            joinedAt: new Date().toISOString().slice(0, 10),
          })
          .returning({ id: staff.id });
        staffId = createdStaff!.id;
        actorName = params.name;
        auditAction = "created";
        auditField = null;
      }

      await tx.insert(auditLog).values({
        actorId: staffId,
        actorName,
        action: auditAction,
        resourceType: "staff",
        resourceId: staffId,
        field: auditField,
      });

      return { userId, staffId };
    });

    return { ok: true, userId: result.userId, staffId: result.staffId };
  } catch (err) {
    if (err instanceof InvitationRaceError) {
      console.debug(`acceptInvitation: invitation ${invitation.id} was claimed by a concurrent request`);
      return { ok: false };
    }
    if (err instanceof InvitationTakeoverError) {
      console.debug(`acceptInvitation: invitation ${invitation.id}'s email already has an active account`);
      return { ok: false };
    }
    throw err;
  }
}
