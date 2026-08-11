import { eq } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/db/schema";

/**
 * plan/02-authentication.md §2.1. `algorithm: 2` is `Algorithm.Argon2id` on
 * `@node-rs/argon2`'s `Options` type (node_modules/@node-rs/argon2/index.d.ts)
 * — that type is a `const enum`, which can't be imported here because this
 * project runs with `isolatedModules` (Next 16 / SWC transpile one file at a
 * time, so const-enum inlining isn't available), hence the literal rather
 * than `Algorithm.Argon2id`.
 *
 * These parameters are unverified against a real Vercel function — plan
 * §2.1 says to measure hash latency there and lower `memoryCost` (never
 * change algorithm) if a login exceeds ~500ms. No deployed function exists
 * in this workspace to measure against; do that check in Phase 10.
 *
 * Exported (Task 3): `lib/server/auth/credentials.ts` reuses this exact
 * constant to hash provisioning/invitation/reset passwords with
 * `@node-rs/argon2`'s `hash()` directly, the same way this file's own
 * `emailAndPassword.password.hash` does — rather than reaching through
 * `auth.options.emailAndPassword.password.hash`, which is the same function
 * but typed as `unknown`-ish through Better Auth's generic options shape.
 */
export const ARGON2_PARAMS = {
  algorithm: 2, // argon2id
  memoryCost: 19456, // 19 MiB — OWASP minimum
  timeCost: 2,
  parallelism: 1,
};

/**
 * plan/02-authentication.md §4.1: "Keep me signed in on this device" extends
 * the *absolute* session lifetime to 7 days on that device — it must NOT
 * extend the 30-minute idle timeout (session.ts enforces that separately
 * and unconditionally). Task 2 flagged that Better Auth's own `rememberMe`
 * flag does the opposite of what's needed here: verified against
 * node_modules/better-auth/dist/db/internal-adapter.mjs's `createSession`,
 * `dontRememberMe` (i.e. `rememberMe: false`) sets a *shorter* fixed 1-day
 * expiry and a session-only cookie, while the default (`rememberMe: true`)
 * just uses the configured `session.expiresIn` (12h, above) — neither
 * option reaches 7 days. Task 4 (login/mfa Server Actions) signals this
 * per-request via this header on the `auth.api.signInEmail` /
 * `auth.api.verifyTOTP` call, read back below in
 * `databaseHooks.session.create.before`.
 *
 * A header rather than a body field because the hook only receives the
 * about-to-be-inserted `session` row plus a `GenericEndpointContext`, not
 * the original request body — but `context.getHeader()` (better-call's
 * `EndpointContext`, node_modules/better-call/dist/endpoint.d.mts) reads
 * whatever `headers` was passed to the originating `auth.api.*` call,
 * which is the same channel `internalAdapter.createSession` itself already
 * relies on (via `getCurrentAuthContext()`) to resolve `ipAddress`/
 * `userAgent` for the row it's building in that same hook cycle — not a
 * new or unproven mechanism, the exact same one Better Auth's own code
 * uses one line above where this hook plugs in.
 */
export const KEEP_SIGNED_IN_HEADER = "x-careflow-keep-signed-in";
const KEEP_SIGNED_IN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * plan/02-authentication.md §2. Better Auth's own `user`/`session`/`account`/
 * `verification`/`twoFactor` tables plus the `admin` plugin's fields on
 * `user`/`session` all live in lib/server/db/schema/auth.ts, joined to (not
 * merged with) this product's `staff` table per audit risk R8 — see that
 * file's header comment.
 *
 * `db` already carries the full merged Drizzle schema (lib/server/db/index.ts),
 * so the adapter's `db._.fullSchema` fallback would technically work without
 * passing `schema` — passed explicitly anyway so model lookups don't depend
 * on that internal Drizzle property.
 *
 * `@node-rs/argon2` is a native module: every route that touches `auth` must
 * run on the Node runtime. Next 16's proxy.ts is Node-only by default (plan
 * §4.1), so this doesn't constrain anything new — just don't add
 * `export const runtime = "edge"` near this code or anything that imports it.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // there is no registration in this product
    password: {
      hash: (password) => hash(password, ARGON2_PARAMS),
      verify: ({ hash: passwordHash, password }) => verify(passwordHash, password),
    },
    // plan §4 "Rotation: new session id on ... password change". This
    // product's only password-change surface is the token-based reset flow
    // (plan §7 / Task 3's /forgot-password → /reset-password), not an
    // authenticated /change-password screen (none exists in plan §8's
    // screen table). Revoking every session forces a fresh sign-in, which
    // is exactly session-id rotation — verified against
    // node_modules/better-auth/dist/api/routes/password.mjs's
    // `resetPassword` handler, which calls
    // `internalAdapter.deleteUserSessions(userId)` when this is true. The
    // matching `sendResetPassword` callback and the reset screens
    // themselves are Task 3/4's job; this flag just makes the mechanism do
    // the right thing once they exist.
    //
    // Better Auth's other password-change surface, POST /change-password
    // (node_modules/better-auth/dist/api/routes/update-user.mjs), is
    // authenticated and rotates the session id only when the *caller*
    // passes `revokeOtherSessions: true` per request — there is no
    // instance-level config for it. Nothing in this product calls that
    // endpoint yet; if a future phase adds an in-app "change password"
    // screen, it must pass `revokeOtherSessions: true` itself to get the
    // same guarantee.
    //
    // plan §4's OTHER rotation trigger, "on privilege change", has no
    // implementation here on purpose: there is no privilege-change flow in
    // this codebase yet (role/department changes land in Phase 03's
    // nine-role authorization matrix). Don't invent one. Whatever Phase 03
    // adds should rotate the acting session's id the same way this does —
    // e.g. by revoking and recreating it, or by mirroring
    // `revokeOtherSessions` on whatever endpoint performs the change.
    revokeSessionsOnPasswordReset: true,
  },

  session: {
    expiresIn: 60 * 60 * 12, // absolute ceiling: 12 hours
    updateAge: 0, // idle timeout handled explicitly, see plan §4
    cookieCache: { enabled: true, maxAge: 60 },
  },

  /**
   * plan/02-authentication.md §2.2's last paragraph (moved into Task 2's
   * scope by the controller; see task-2-brief.md): "Every session resolves
   * to a `staff` row. A `user` without one cannot sign in; the callback
   * rejects it."
   *
   * `session.create.before` is the hook that fires at the point a session
   * row is about to be inserted — verified against
   * node_modules/better-auth/dist/db/with-hooks.mjs's `createWithHooks`:
   * returning `false` makes `createWithHooks` resolve to `null`, which
   * every call site (`internalAdapter.createSession`, used by both
   * `/sign-in/email` and the twoFactor plugin's own post-TOTP
   * `verifyTwoFactor`) treats as "failed to create session" and throws.
   * This is the *only* wrapper this invariant needs: enforcing it here
   * covers every path that creates a session, including the TOTP-verified
   * one, and needs no separate custom sign-in wrapper (see task-2-report.md
   * for why this reads on the brief's "build one wrapper that does both"
   * fallback instruction).
   *
   * Deliberately does NOT also check `user.twoFactorEnabled` here — see
   * task-2-report.md for why that check lives in
   * lib/server/auth/session.ts's read-side validation instead of blocking
   * session creation.
   */
  databaseHooks: {
    session: {
      create: {
        before: async (session, context) => {
          const [staffRow] = await db
            .select({ id: schema.staff.id })
            .from(schema.staff)
            .where(eq(schema.staff.userId, session.userId))
            .limit(1);
          if (!staffRow) return false;

          // plan §4.1's 7-day "keep me signed in" override — see
          // KEEP_SIGNED_IN_HEADER's comment above. Only ever *extends* the
          // absolute lifetime; the idle timeout this doesn't touch is what
          // actually locks a shared workstation (session.ts, 30 minutes).
          if (context?.getHeader(KEEP_SIGNED_IN_HEADER) === "1") {
            return { data: { expiresAt: new Date(Date.now() + KEEP_SIGNED_IN_MS) } };
          }
        },
      },
    },
  },

  plugins: [
    twoFactor({
      issuer: "CareFlow · St. Aurora",
      // plan §5 / task-2-brief.md §5: this product has exactly one lockout
      // system (`auth_attempts`, lib/server/auth/lockout.ts), reused by MFA
      // per plan §3.1 ("Three failures reuse the lockout counter from
      // §5"). The twoFactor plugin ships its own independent lockout over
      // the `verified` / `failed_verification_count` / `locked_until`
      // columns Task 1 added to `two_factor` (required unconditionally by
      // the plugin's schema, kept for that reason) — verified against
      // node_modules/better-auth/dist/plugins/two-factor/verify-two-factor.mjs's
      // `resolveAccountLockoutConfig`, which reads `accountLockout` off
      // this same plugin config and defaults `enabled` to `true`.
      // Disabling it here (rather than setting a very high threshold)
      // stops it from ever firing, leaving `auth_attempts` as the sole
      // source of truth. The columns stay in the schema — the plugin still
      // requires them to exist even when disabled.
      accountLockout: { enabled: false },
    }),
    // create, list, ban, impersonate. plan/03-authorisation.md §7 caps an
    // impersonated session at 30 minutes; this sets the `expires_at` the
    // plugin stamps on the session it creates (verified against
    // node_modules/better-auth/dist/plugins/admin/routes.mjs, whose
    // `impersonateUser` reads `impersonationSessionDuration` and otherwise
    // defaults to 3600 seconds — an hour, twice what the plan allows).
    //
    // Not the only enforcement, and deliberately not: lib/server/auth/session.ts
    // re-checks the 30 minutes against `session.created_at` on every request.
    // A cap that lives only in the row's `expires_at` is a cap that a bad
    // `expires_at` silently removes, and the read-side check costs nothing
    // since that function already loads the row.
    admin({ impersonationSessionDuration: 30 * 60 }),
    // Must be last: node_modules/better-auth/dist/integrations/next-js.mjs's
    // `nextCookies()` reads `set-cookie` off the internal response of
    // whatever ran before it and replays it through next/headers' cookies()
    // API, which is what actually persists the session cookie when
    // `auth.api.*` is called directly from a Server Action (this product's
    // only call path per plan §8 — no client-side authClient, no mounted
    // /api/auth/[...all] route handler exists in this worktree yet). Task 1
    // did not add this; without it, Task 4's login/mfa Server Actions would
    // compute a session but never actually set it in the browser. Flagged
    // for Task 3/4 in task-2-report.md.
    nextCookies(),
  ],
});
