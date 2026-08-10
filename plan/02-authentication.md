# Phase 02 — Authentication

Turning three screens that presently validate nothing into real credential checking, mandatory
TOTP, and sessions that expire.

Depends on Phase 01. Blocks Phase 03.

Discharges `docs/SECURITY.md` §3.1 and the first row of its §1 posture table.

---

## 1. What the screens do today

| Screen | Behaviour |
|---|---|
| `/login` | Checks the fields are non-empty, `setTimeout(600)`, `router.push("/mfa")` |
| `/mfa` | Presents the code entry, accepts anything |
| `/forgot-password` | Presents the form, sends nothing |

Their markup is correct and stays. Only the submit handlers change. Every string on those pages —
"Sessions expire after 30 minutes of inactivity", "Access to patient records is monitored" —
becomes true rather than aspirational, which is the point of this phase.

---

## 2. Better Auth

```
npm i better-auth @node-rs/argon2
```

```ts
// lib/server/auth/index.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor, admin } from "better-auth/plugins";
import { hash, verify } from "@node-rs/argon2";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,          // there is no registration in this product
    password: {
      hash: (p) => hash(p, ARGON2_PARAMS),
      verify: ({ hash: h, password }) => verify(h, password),
    },
  },

  session: {
    expiresIn: 60 * 60 * 12,      // absolute ceiling: 12 hours
    updateAge: 0,                 // idle timeout handled explicitly, see §4
    cookieCache: { enabled: true, maxAge: 60 },
  },

  plugins: [
    twoFactor({ issuer: "CareFlow · St. Aurora" }),
    admin(),                      // create, list, ban, impersonate
  ],
});
```

`disableSignUp` is the whole registration policy. There is no `/register` route to forget to
protect, and Better Auth rejects a signup call even if one is constructed by hand.

### 2.1 argon2id parameters

```ts
const ARGON2_PARAMS = {
  algorithm: 2,        // argon2id
  memoryCost: 19456,   // 19 MiB — OWASP minimum
  timeCost: 2,
  parallelism: 1,
};
```

`@node-rs/argon2` is a native module and needs the Node runtime. Every route touching it must not
be edge. In Next 16 `proxy.ts` is Node-only by default, so this constrains nothing.

Measure the hash on a Vercel free function before committing the parameters. If a login takes
longer than about 500ms, lower `memoryCost` rather than switching algorithm. Never bcrypt at
defaults, never SHA-anything — `docs/SECURITY.md` §3.1.

### 2.2 Auth tables stay separate from `staff`

Risk R8. Better Auth owns `user`, `session`, `account`, `verification`, and `two_factor`. The
product owns `staff`. They are joined, not merged:

```sql
ALTER TABLE staff ADD COLUMN user_id TEXT UNIQUE REFERENCES "user"(id);
```

Better Auth can then evolve its schema across versions without touching the product's. `staff`
keeps `role`, `department_id`, `status`, and `mfa_enabled` — the columns `/admin/users` renders —
while `user` keeps credentials.

Every session resolves to a `staff` row. A `user` without one cannot sign in; the callback
rejects it. That is the invariant that keeps an orphaned auth record from becoming an
unprivileged-but-present account.

---

## 3. Multi-factor

Mandatory for every role, per `docs/SECURITY.md` §3.1. `/admin/security` already tracks coverage
and lists accounts without it — this makes that number real instead of decorative.

| Element | Decision |
|---|---|
| Factor | TOTP, 6 digits, 30s period, SHA-1 (what authenticator apps implement) |
| Enrolment | During first sign-in from an invitation. Not skippable |
| Recovery | 10 single-use codes, shown once, stored argon2-hashed |
| Reset | A Hospital Admin can clear a staff member's TOTP; the reset is written to the audit log |
| Verification window | ±1 period, to tolerate clock skew |
| Replay | A used code is rejected for its remaining window |

WebAuthn is preferred by `docs/SECURITY.md` §3.1 and is deferred. TOTP is the stated minimum and
covers the threat — stolen credentials — that §4 of that document names. Recorded as deferred in
[12-decisions-and-risks.md](12-decisions-and-risks.md).

### 3.1 The `/mfa` screen

Same markup. The submit handler calls a Server Action that verifies against Better Auth's
`twoFactor` plugin. Three failures reuse the lockout counter from §5, so brute-forcing a six-digit
code is not cheaper than brute-forcing a password.

---

## 4. Sessions

| Property | Value | Source |
|---|---|---|
| Transport | httpOnly cookie | `docs/SECURITY.md` §3.1 — never `localStorage`, which any XSS reads |
| `SameSite` | `Strict` | |
| `Secure` | true | |
| Idle timeout | 30 minutes | The login screen already promises this |
| Absolute lifetime | 12 hours | A shift is over by then |
| Rotation | New session id on privilege change and on password change | |

Idle timeout is enforced by storing `last_seen_at` on the session and checking it on every
request, not by cookie `maxAge` alone — a cookie's expiry is a client-side hint, and a stale
session must be invalid server-side.

"Keep me signed in on this device" on the login screen extends the *absolute* lifetime to 7 days
on that device. It does not extend the idle timeout. A shared workstation still locks after 30
minutes, which is the control that matters.

### 4.1 `proxy.ts`

Next 16 renamed `middleware.ts` to `proxy.ts` and the runtime is Node, not edge, and is not
configurable.

```ts
// proxy.ts
export const config = { matcher: ["/((?!_next/static|_next/image|favicon|login|forgot-password).*)"] };

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!session.user.twoFactorVerified) return NextResponse.redirect(new URL("/mfa", request.url));
  return NextResponse.next();
}
```

Because the runtime is Node, this is a genuine check rather than a cosmetic redirect. It is still
not the only check: every server shell calls `requireSession()` and every service takes a session
argument. Two layers, because a matcher typo is a silent hole and a missing function argument is
a compile error.

---

## 5. Lockout

Progressive, counted twice — per account and per IP. Per-account alone lets an attacker spray one
password across every account; per-IP alone lets a botnet through.

```sql
CREATE TABLE auth_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT,
  ip         INET NOT NULL,
  outcome    TEXT NOT NULL,        -- 'success' | 'bad_password' | 'bad_totp' | 'locked'
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attempts_email ON auth_attempts(email, at DESC);
CREATE INDEX idx_attempts_ip    ON auth_attempts(ip, at DESC);
```

| Failures in 15 minutes | Consequence |
|---|---|
| 5 | 1 minute delay |
| 10 | 15 minute lock |
| 15 | Locked until a Hospital Admin clears it |

Responses stay identical whether the account exists or not, and take the same time either way —
otherwise the lockout becomes a user-enumeration oracle. Compare against a dummy hash when no
user is found.

Every lock writes an audit entry and a `security` notification to Hospital Admins.

Rows older than 30 days are deleted by the nightly job. This table grows fast under attack and
nothing needs it long.

---

## 6. Provisioning

No registration exists, so accounts arrive two ways.

### 6.1 The first account — you

```
npm run provision -- --email you@example.com --name "…" --role "Hospital Admin"
```

`scripts/provision.ts` creates the `user` and its `staff` row, prints a single-use enrolment link,
and exits. It refuses to run if any Hospital Admin already exists, unless `--force` is given. Run
once per environment.

### 6.2 Everyone else — invitations

`/admin/users` already renders the staff table and an invite affordance. It gains a real backend.

```sql
CREATE TABLE invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  role          staff_role NOT NULL,
  department_id UUID REFERENCES departments(id),
  token_hash    TEXT NOT NULL,          -- the token itself is never stored
  invited_by    UUID NOT NULL REFERENCES staff(id),
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Token: 32 random bytes, base64url, shown once in the emailed link, stored only as a hash. Expires
in 72 hours. Single use.

Acceptance is one transaction: set the password, enrol TOTP, create the `staff` row, mark the
invitation accepted, write the audit entry. A half-accepted invitation is not a state the system
can be in.

The invitation email goes through the provider adapter from Phase 07, so in sandbox mode the link
is written to the outbound message log and the server console rather than sent. That is enough to
provision an account locally without any email service.

### 6.3 Seeded staff

The 12 staff in `lib/data/people.ts` are seeded as `staff` rows with `status = 'invited'` and no
`user_id`. They appear in `/admin/users` exactly as they do today, and each can be turned into a
real account by sending an invitation. None of them can sign in until someone does.

This keeps the demo's staff list intact without creating twelve credentialed accounts nobody
controls.

---

## 7. Password reset

`/forgot-password` keeps its markup and gains the standard flow: single-use token, 1 hour expiry,
hashed at rest, invalidates every active session on use.

The response is identical whether the address is known or not. The screen already says "If an
account exists for that address, we've sent a reset link" — that copy was written for this
behaviour.

Reset does not bypass MFA. After setting a new password the user still presents TOTP.

---

## 8. Screen changes

| File | Change |
|---|---|
| `app/(auth)/login/page.tsx` | `onSubmit` calls a Server Action. `setTimeout` and `router.push` removed. Error strings come from the action |
| `app/(auth)/mfa/page.tsx` | Verifies a real code. Adds the enrolment variant for first sign-in |
| `app/(auth)/forgot-password/page.tsx` | Calls the request-reset action |
| `app/(auth)/reset-password/page.tsx` | **New.** Consumes the token, sets the password |
| `app/(auth)/accept-invite/page.tsx` | **New.** Password plus TOTP enrolment, one submit |
| `proxy.ts` | **New.** §4.1 |
| `components/shell/top-bar.tsx` | Reads the session instead of `CURRENT_USER`. Sign-out becomes real |
| `lib/data/constants.ts` `CURRENT_USER` | Kept for seeding. No longer imported by any component |

Two new screens. Both reuse the `(auth)` layout and the existing form primitives, so neither is
new design work.

---

## 9. Done when

- [ ] A wrong password is rejected; the message does not reveal whether the account exists
- [ ] Timing is indistinguishable between an unknown address and a wrong password
- [ ] Sign-in without TOTP cannot reach any `(app)` route
- [ ] `/admin/audit` and every other route redirect to `/login` when signed out
- [ ] The session cookie is httpOnly, `SameSite=Strict`, `Secure`
- [ ] 31 minutes idle forces re-authentication
- [ ] 13 hours elapsed forces re-authentication regardless of activity
- [ ] 5, 10, and 15 failures produce the three documented consequences
- [ ] Lockout counts by IP as well as by email, verified with two different addresses
- [ ] An invitation link works once and is dead the second time
- [ ] An expired invitation is refused
- [ ] Acceptance failure part-way leaves no `staff` row and no usable `user`
- [ ] A recovery code signs in once and never again
- [ ] Password reset invalidates other active sessions
- [ ] Sign-in, sign-out, lockout, TOTP reset, and invitation acceptance each write an audit entry
- [ ] `npm run provision` refuses to create a second Hospital Admin without `--force`
- [ ] No component imports `CURRENT_USER` any more
