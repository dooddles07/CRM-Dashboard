"use server";

import { headers as nextHeaders } from "next/headers";
import { eq } from "drizzle-orm";
import { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins";
import { applySetCookies } from "better-auth/cookies";
import { auth, KEEP_SIGNED_IN_HEADER } from "./index";
import { resolveClientIp } from "./session";
import { checkLockout, recordAuthAttempt, type LockoutConsequence } from "./lockout";
import { requestPasswordReset, consumePasswordReset } from "./password-reset";
import { acceptInvitation } from "./invitations";
import { totpUriToQrDataUrl, extractManualEntryKey } from "./totp-qr";
import { db } from "@/lib/server/db";
import { staff } from "@/lib/server/db/schema/people";
import { auditLog } from "@/lib/server/db/audit-log";

/**
 * task-4-brief.md's Server Actions for the auth screens (plan §3, §3.1, §7,
 * §8 rows 1-5). One file: every action here shares the same small set of
 * helpers (lockout wrapping, IP resolution, audit writes, header-based
 * "keep me signed in" signalling) and the whole surface is Task 4's, so
 * splitting per-route would just duplicate those.
 *
 * Every exported function is a Server Action reachable by anyone who can
 * POST to it (server-actions.md's security section) — each one re-derives
 * identity from the session/headers/DB itself rather than trusting a
 * caller-supplied id, and never returns more than the UI needs.
 */

const GENERIC_CREDENTIALS_ERROR = "That email or password isn't right.";
const GENERIC_CODE_ERROR = "That code isn't valid. Try again.";
const EXPIRED_CHALLENGE_ERROR = "Your sign-in session has expired. Please sign in again.";
const MIN_PASSWORD_LENGTH = 12;

function describeLockout(consequence: LockoutConsequence): string {
  switch (consequence.kind) {
    case "delay":
    case "locked": {
      const minutes = Math.max(1, Math.ceil((consequence.retryAt.getTime() - Date.now()) / 60000));
      return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    case "admin_lock":
      return "This account is locked. Contact your hospital administrator to unlock it.";
    case "none":
      return "";
  }
}

/** Every action needs the incoming request's headers, both to forward to `auth.api.*` calls (cookies) and to resolve the client IP for lockout/audit. */
async function requestContext() {
  const headerList = await nextHeaders();
  const ip = resolveClientIp(headerList) ?? "0.0.0.0";
  return { headerList, ip };
}

/**
 * Clones the incoming request headers and, when `keepSignedIn` is true,
 * stamps `KEEP_SIGNED_IN_HEADER` — read back by the `session.create.before`
 * hook in ./index.ts to extend that session's absolute lifetime to 7 days
 * (plan §4.1). Passed to every `auth.api.*` call that might create a
 * session: sign-in, sign-in-time TOTP/backup-code verify, and the verify
 * call that completes enrolment (which also creates/rotates a session).
 */
function authHeaders(base: Headers, keepSignedIn: boolean): Headers {
  const out = new Headers(base);
  if (keepSignedIn) out.set(KEEP_SIGNED_IN_HEADER, "1");
  return out;
}

type StaffRow = typeof staff.$inferSelect;

async function resolveStaffByUserId(userId: string): Promise<StaffRow | undefined> {
  const [row] = await db.select().from(staff).where(eq(staff.userId, userId)).limit(1);
  return row;
}

async function writeAudit(params: {
  actorId: string | null;
  actorName: string;
  action: "signed_in" | "signed_out" | "updated";
  resourceId: string;
  field?: string;
  ip?: string | null;
}): Promise<void> {
  await db.insert(auditLog).values({
    actorId: params.actorId,
    actorName: params.actorName,
    action: params.action,
    resourceType: "staff",
    resourceId: params.resourceId,
    field: params.field ?? null,
    ipAddress: params.ip ?? null,
  });
}

/** Reads a thrown `auth.api.*` failure's Better Auth error code, if it has one — see this file's header comment on `TWO_FACTOR_ERROR_CODES` for why `.body.code` is reliable here (verified against `defineErrorCodes` in @better-auth/core). */
function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body?: unknown }).body;
    if (body && typeof body === "object" && "code" in body) {
      return String((body as { code?: unknown }).code);
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* 1. Sign-in (plan §8 row 1)                                                 */
/* -------------------------------------------------------------------------- */

export type SignInActionResult = { ok: true; next: string } | { ok: false; error: string };

/**
 * task-4-brief.md §1. Signs in through `auth.api.signInEmail` (Better
 * Auth's own flow — Task 2 verified its user-not-found branch still runs a
 * dummy argon2 hash, which is what makes an unknown email cost the same as
 * a wrong password; this action must not hand-roll that check). Every
 * attempt is wrapped in the lockout module: checked before, recorded
 * after, same generic error either way (§9 "Done when": "the message does
 * not reveal whether the account exists").
 */
export async function signInAction(input: {
  email: string;
  password: string;
  keepSignedIn: boolean;
}): Promise<SignInActionResult> {
  const email = input.email.trim().toLowerCase();
  const { headerList, ip } = await requestContext();

  const preCheck = await checkLockout({ email, ip });
  if (preCheck.kind !== "none") {
    await recordAuthAttempt({ email, ip, outcome: "locked" });
    return { ok: false, error: describeLockout(preCheck) };
  }

  let result: Awaited<ReturnType<typeof auth.api.signInEmail>>;
  try {
    result = await auth.api.signInEmail({
      body: { email, password: input.password },
      headers: authHeaders(headerList, input.keepSignedIn),
    });
  } catch {
    const consequence = await recordAuthAttempt({ email, ip, outcome: "bad_password" });
    return { ok: false, error: consequence.kind === "none" ? GENERIC_CREDENTIALS_ERROR : describeLockout(consequence) };
  }

  await recordAuthAttempt({ email, ip, outcome: "success" });

  const remember = input.keepSignedIn ? "?remember=1" : "";

  // twoFactor plugin's after-hook (node_modules/better-auth/dist/plugins/two-factor/index.mjs)
  // replaces a successful credential check with this shape whenever
  // `user.twoFactorEnabled` is true and no trusted-device cookie applies —
  // no session exists yet, the user still has to present TOTP/a recovery code.
  if ("twoFactorRedirect" in result && result.twoFactorRedirect) {
    return { ok: true, next: `/mfa${remember}` };
  }

  // No redirect: a real session now exists. Either (a) `twoFactorEnabled`
  // is true and this browser held a valid "trust this device" cookie, so
  // the user is genuinely fully signed in, or (b) `twoFactorEnabled` is
  // false — task-4-brief.md §1's "shouldn't normally happen post-Task-3"
  // case, an invitation accepted but abandoned before TOTP enrolment
  // finished. Both cases already have a live session at this point (the
  // staff-resolution hook in ./index.ts already required a `staff` row to
  // get this far), so the sign-in itself is real either way.
  const staffRow = await resolveStaffByUserId(result.user.id);
  await writeAudit({
    actorId: staffRow?.id ?? null,
    actorName: staffRow?.name ?? result.user.name,
    action: "signed_in",
    resourceId: staffRow?.id ?? result.user.id,
    ip,
  });

  if (result.user.twoFactorEnabled) {
    return { ok: true, next: "/" };
  }
  // Not enrolled yet — force enrolment before this session is good for
  // anything else. session.ts's `resolveSession` already refuses any
  // `requireSession()`-gated route for a `twoFactorEnabled: false` user, so
  // this is enforced server-side regardless of where the client navigates;
  // sending them to /mfa here just gets them there directly instead of
  // bouncing off a protected route first. See task-4-report.md §6 for why
  // this ("resume enrolment on next sign-in") was chosen over the
  // account-unusable alternative.
  return { ok: true, next: `/mfa${remember}` };
}

/* -------------------------------------------------------------------------- */
/* 2. Sign-out                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Not in plan §8's table (the top-bar button that calls this is Task 5's),
 * but the action itself belongs with the rest of the auth flows —
 * task-4-brief.md §7. Destroys the session server-side (`auth.api.signOut`
 * deletes the DB row, not just the cookie) and writes an audit entry.
 */
export async function signOutAction(): Promise<{ ok: true }> {
  const { headerList, ip } = await requestContext();

  const session = await auth.api.getSession({ headers: headerList });
  if (session) {
    const staffRow = await resolveStaffByUserId(session.user.id);
    await writeAudit({
      actorId: staffRow?.id ?? null,
      actorName: staffRow?.name ?? session.user.name,
      action: "signed_out",
      resourceId: staffRow?.id ?? session.user.id,
      ip,
    });
  }

  await auth.api.signOut({ headers: headerList });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* 3. /mfa — sign-in-time verification (plan §3, §3.1)                        */
/* -------------------------------------------------------------------------- */

export type VerifyMfaActionResult = { ok: true } | { ok: false; error: string };

/**
 * task-4-brief.md §2. Verifies the pending post-password 2FA challenge —
 * either a TOTP code (`auth.api.verifyTOTP`) or a recovery code
 * (`auth.api.verifyBackupCode`, see task-4-report.md for why recovery
 * codes use the `twoFactor` plugin's own backup-code storage rather than a
 * custom argon2-hashed table). Both endpoints already enforce the ±1
 * period window and single-use replay rejection themselves (verified in
 * node_modules/better-auth/dist/plugins/two-factor/{totp,backup-codes}/index.mjs)
 * — this only adds what they don't: the shared `auth_attempts` lockout.
 *
 * Lockout here is deliberately IP-keyed only (`email: null`), not
 * email+IP like sign-in. The pending challenge's identity lives in a
 * signed, httpOnly cookie this app never decodes (the plugin's own
 * cookie-resolution helper isn't part of its public export surface —
 * verified, not guessed). Accepting a client-submitted email for this
 * bookkeeping instead would let anyone who has passed their *own*
 * password step fail MFA on purpose while claiming an arbitrary victim's
 * email, locking that victim's account without ever attempting their real
 * credentials. IP-keyed still enforces the same 5/10/15 thresholds from
 * plan §5 against the one dimension that can't be spoofed by the request
 * body.
 */
export async function verifyMfaAction(input: {
  code: string;
  isRecoveryCode: boolean;
  trustDevice: boolean;
  keepSignedIn: boolean;
}): Promise<VerifyMfaActionResult> {
  const { headerList, ip } = await requestContext();

  const preCheck = await checkLockout({ email: null, ip });
  if (preCheck.kind !== "none") {
    await recordAuthAttempt({ email: null, ip, outcome: "locked" });
    return { ok: false, error: describeLockout(preCheck) };
  }

  const callHeaders = authHeaders(headerList, input.keepSignedIn);

  try {
    const result = input.isRecoveryCode
      ? await auth.api.verifyBackupCode({ body: { code: input.code, trustDevice: input.trustDevice }, headers: callHeaders })
      : await auth.api.verifyTOTP({ body: { code: input.code, trustDevice: input.trustDevice }, headers: callHeaders });

    await recordAuthAttempt({ email: result.user.email, ip, outcome: "success" });
    const staffRow = await resolveStaffByUserId(result.user.id);
    await writeAudit({
      actorId: staffRow?.id ?? null,
      actorName: staffRow?.name ?? result.user.name,
      action: "signed_in",
      resourceId: staffRow?.id ?? result.user.id,
      ip,
    });
    return { ok: true };
  } catch (err) {
    const code = errorCode(err);
    if (code === TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.code) {
      return { ok: false, error: EXPIRED_CHALLENGE_ERROR };
    }
    const consequence = await recordAuthAttempt({ email: null, ip, outcome: "bad_totp" });
    return { ok: false, error: consequence.kind === "none" ? GENERIC_CODE_ERROR : describeLockout(consequence) };
  }
}

/* -------------------------------------------------------------------------- */
/* 4. /mfa — enrolment (plan §3, §8 row 2)                                    */
/* -------------------------------------------------------------------------- */

export interface EnrolmentStart {
  totpUri: string;
  manualKey: string;
  qrDataUrl: string;
  /**
   * `enableTwoFactor`'s own plaintext backup codes (node_modules/better-auth/dist/plugins/two-factor/index.mjs) —
   * generated in the same call that creates the TOTP secret, not
   * separately. Carried through client state (never re-displayed, never
   * re-fetched — the encrypted copy that persists server-side can't be
   * decrypted back into a fresh plaintext array without another
   * password-gated `auth.api.*` call) and revealed by the enrolment
   * wizard only after `verifyEnrolmentAction` confirms the code, matching
   * plan §3's "on success ... shown once" ordering even though generation
   * itself happens one step earlier than that.
   */
  recoveryCodes: string[];
}

export type StartEnrolmentActionResult = { ok: true; enrolment: EnrolmentStart } | { ok: false; error: string };

/**
 * task-4-brief.md §3, the "resumed abandoned enrolment" path only (§6's
 * note: an invitation was accepted but TOTP setup was never finished, so
 * the user reaches this screen from a fresh `/login` sign-in rather than
 * straight out of `/accept-invite`). Requires the real (if
 * `twoFactorEnabled: false`) session `signInAction` just created, and asks
 * for the password again — `auth.api.enableTwoFactor`'s body requires one
 * (its zod schema makes `password` non-optional unless the plugin is
 * configured `allowPasswordless`, which this app's isn't), and the
 * password from the original sign-in submission a request ago isn't
 * available here to reuse. Re-confirming it is also a reasonable thing to
 * ask before handing over a TOTP secret, not just an API constraint.
 *
 * `/accept-invite` doesn't call this — it already has the just-set
 * password in scope and calls `auth.api.enableTwoFactor` directly (see
 * `acceptInviteAction` below), landing at the same `EnrolmentStart` shape.
 */
export async function startEnrolmentAction(input: { password: string }): Promise<StartEnrolmentActionResult> {
  const { headerList, ip } = await requestContext();

  const session = await auth.api.getSession({ headers: headerList });
  if (!session) return { ok: false, error: EXPIRED_CHALLENGE_ERROR };
  if (session.user.twoFactorEnabled) {
    // Already enrolled — nothing for this action to do; the page itself
    // should not have offered this step. Fail closed rather than re-issue
    // a secret for an already-protected account.
    return { ok: false, error: "Two-factor authentication is already set up for this account." };
  }

  const preCheck = await checkLockout({ email: session.user.email, ip });
  if (preCheck.kind !== "none") {
    await recordAuthAttempt({ email: session.user.email, ip, outcome: "locked" });
    return { ok: false, error: describeLockout(preCheck) };
  }

  let enabled: Awaited<ReturnType<typeof auth.api.enableTwoFactor>>;
  try {
    enabled = await auth.api.enableTwoFactor({
      body: { password: input.password, issuer: "CareFlow · St. Aurora" },
      headers: headerList,
    });
  } catch {
    const consequence = await recordAuthAttempt({ email: session.user.email, ip, outcome: "bad_password" });
    return { ok: false, error: consequence.kind === "none" ? "Incorrect password." : describeLockout(consequence) };
  }

  await recordAuthAttempt({ email: session.user.email, ip, outcome: "success" });

  return {
    ok: true,
    enrolment: {
      totpUri: enabled.totpURI,
      manualKey: extractManualEntryKey(enabled.totpURI),
      qrDataUrl: await totpUriToQrDataUrl(enabled.totpURI),
      recoveryCodes: enabled.backupCodes,
    },
  };
}

export type VerifyEnrolmentActionResult = { ok: true } | { ok: false; error: string };

/**
 * Completes enrolment for both `/mfa`'s resumed-enrolment path and
 * `/accept-invite`: verifies the code against the secret `enableTwoFactor`
 * just created (`auth.api.verifyTOTP`, taking the "already has a session"
 * branch — verified against
 * node_modules/better-auth/dist/plugins/two-factor/totp/index.mjs: `isSignIn`
 * is false whenever a real session exists, which is what lets this succeed
 * even though `twoFactor.verified` is still false at this point), flips
 * `staff.mfaEnabled` (task-4-brief.md §3: "Task 3 deliberately left it
 * false — this is the step that flips it"), and returns the plaintext
 * recovery codes for one-time display — `enableTwoFactor` already
 * generated and stored them; this is the first point they're shown,
 * matching plan §3's "on success ... shown once" ordering.
 */
export async function verifyEnrolmentAction(input: { code: string; keepSignedIn: boolean }): Promise<VerifyEnrolmentActionResult> {
  const { headerList, ip } = await requestContext();

  const session = await auth.api.getSession({ headers: headerList });
  if (!session) return { ok: false, error: EXPIRED_CHALLENGE_ERROR };

  const preCheck = await checkLockout({ email: session.user.email, ip });
  if (preCheck.kind !== "none") {
    await recordAuthAttempt({ email: session.user.email, ip, outcome: "locked" });
    return { ok: false, error: describeLockout(preCheck) };
  }

  // The plugin's own per-account 2FA lockout is disabled instance-wide
  // (accountLockout: { enabled: false }, ./index.ts) — this call, like
  // verifyMfaAction's, is the only thing standing between an unlimited
  // guessing loop and plan §3.1's "three failures reuse the lockout
  // counter from §5".
  try {
    await auth.api.verifyTOTP({
      body: { code: input.code },
      headers: authHeaders(headerList, input.keepSignedIn),
    });
  } catch {
    const consequence = await recordAuthAttempt({ email: session.user.email, ip, outcome: "bad_totp" });
    return { ok: false, error: consequence.kind === "none" ? GENERIC_CODE_ERROR : describeLockout(consequence) };
  }

  await recordAuthAttempt({ email: session.user.email, ip, outcome: "success" });

  const staffRow = await resolveStaffByUserId(session.user.id);
  if (staffRow) {
    await db.update(staff).set({ mfaEnabled: true, updatedAt: new Date() }).where(eq(staff.id, staffRow.id));
    await writeAudit({
      actorId: staffRow.id,
      actorName: staffRow.name,
      action: "updated",
      resourceId: staffRow.id,
      field: "mfaEnabled",
      ip,
    });
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* 5. /forgot-password (plan §7, §8 row 3)                                    */
/* -------------------------------------------------------------------------- */

export type RequestPasswordResetActionResult = { ok: true } | { ok: false; error: string };

/**
 * task-4-brief.md §4. `requestPasswordReset` already returns identically
 * (void) whether the address is known or not, and already pays the same
 * timing cost either way — this wrapper must not reintroduce a difference
 * by branching on anything the backend didn't tell it. The only failure
 * this can return is a shape problem with the input itself (not whether
 * the account exists).
 */
export async function requestPasswordResetAction(input: { email: string }): Promise<RequestPasswordResetActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Enter a full email address, including the part after the @." };
  }
  await requestPasswordReset(email);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* 6. /reset-password (plan §7, §8 row 4)                                     */
/* -------------------------------------------------------------------------- */

export type ResetPasswordActionResult = { ok: true } | { ok: false; error: string };

/**
 * task-4-brief.md §5. On success this does NOT sign the user in — "reset
 * does not bypass MFA" (plan §7) — the caller (the /reset-password client
 * component) sends them to /login afterward.
 */
export async function resetPasswordAction(input: { token: string; password: string }): Promise<ResetPasswordActionResult> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const result = await consumePasswordReset({ token: input.token, newPassword: input.password });
  if (!result.ok) {
    return { ok: false, error: "This reset link is invalid, expired, or has already been used." };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* 7. /accept-invite (plan §8 row 5)                                          */
/* -------------------------------------------------------------------------- */

export type AcceptInviteActionResult = { ok: true; enrolment: EnrolmentStart } | { ok: false; error: string };

/**
 * task-4-brief.md §6. `acceptInvitation` (Task 3) covers "set the
 * password, create the staff row, mark the invitation accepted, write the
 * audit entry" in one transaction; TOTP enrolment can't join that
 * transaction (it's an interactive round trip — the user has to scan a QR
 * and type a code) so it happens here, immediately after, using the
 * password that was just accepted (still in scope, so `enableTwoFactor`'s
 * required password field doesn't need to be asked for twice). See
 * task-4-report.md for the abandoned-enrolment handling this implies if
 * the user never comes back to finish the next step.
 */
export async function acceptInviteAction(input: { token: string; name: string; password: string }): Promise<AcceptInviteActionResult> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Enter your full name." };
  }

  const accepted = await acceptInvitation({ token: input.token, password: input.password, name });
  if (!accepted.ok) {
    return { ok: false, error: "This invitation link is invalid, expired, or has already been used." };
  }

  const { headerList, ip } = await requestContext();

  // Establishes the session `enableTwoFactor`/`verifyEnrolmentAction` need.
  // `twoFactorEnabled` is false for this brand-new account, so this
  // succeeds with a real session directly — no 2FA challenge to redirect
  // through, matching the same "no second factor yet" path signInAction
  // handles for a resumed enrolment.
  //
  // `returnHeaders: true` + `applySetCookies` below is load-bearing, not
  // decorative: `nextCookies()` persists the new session cookie into
  // next/headers()'s *response*-side cookie jar (verified in ./index.ts's
  // comment), which is what the browser receives — but that write doesn't
  // retroactively appear in `headerList`, which is a snapshot of the
  // *incoming* request's headers taken once at the top of this action.
  // Reusing `headerList` unmodified for the `enableTwoFactor` call below
  // sends it a `Cookie` header with no session in it, so it 401s. Verified
  // live (Playwright against a real DB): without this merge,
  // `acceptInviteAction` throws inside the `try` below on every real
  // acceptance. `applySetCookies` (better-auth/cookies, re-exported from
  // the same cookie-utils `nextCookies()` itself uses) folds the
  // `Set-Cookie` this sign-in just produced into a `Cookie` header for the
  // next in-process call — the sanctioned pattern for chaining `auth.api.*`
  // calls within one request (`setCookieToHeader` in that same module is
  // effectively this same merge, packaged as a callback).
  const signedIn = await auth.api.signInEmail({
    body: { email: (await resolveInviteEmail(accepted.userId)) ?? "", password: input.password },
    headers: headerList,
    returnHeaders: true,
  });
  if ("twoFactorRedirect" in signedIn.response && signedIn.response.twoFactorRedirect) {
    // Cannot happen for a fresh acceptance (twoFactorEnabled starts
    // false), but fail loudly rather than silently mis-navigate if it
    // ever did.
    return { ok: false, error: "Something went wrong finishing setup. Contact your administrator." };
  }

  await writeAudit({
    actorId: accepted.staffId,
    actorName: name,
    action: "signed_in",
    resourceId: accepted.staffId,
    ip,
  });

  const sessionHeaders = new Headers(headerList);
  const setCookie = signedIn.headers.get("set-cookie");
  if (setCookie) applySetCookies(sessionHeaders, [setCookie]);

  let enabled: Awaited<ReturnType<typeof auth.api.enableTwoFactor>>;
  try {
    enabled = await auth.api.enableTwoFactor({
      body: { password: input.password, issuer: "CareFlow · St. Aurora" },
      headers: sessionHeaders,
    });
  } catch {
    return { ok: false, error: "Something went wrong starting two-factor setup. Contact your administrator." };
  }

  return {
    ok: true,
    enrolment: {
      totpUri: enabled.totpURI,
      manualKey: extractManualEntryKey(enabled.totpURI),
      qrDataUrl: await totpUriToQrDataUrl(enabled.totpURI),
      recoveryCodes: enabled.backupCodes,
    },
  };
}

async function resolveInviteEmail(userId: string): Promise<string | null> {
  const row = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.id, userId), columns: { email: true } });
  return row?.email ?? null;
}
