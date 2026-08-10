import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
 */
const ARGON2_PARAMS = {
  algorithm: 2, // argon2id
  memoryCost: 19456, // 19 MiB — OWASP minimum
  timeCost: 2,
  parallelism: 1,
};

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
  },

  session: {
    expiresIn: 60 * 60 * 12, // absolute ceiling: 12 hours
    updateAge: 0, // idle timeout handled explicitly, see plan §4
    cookieCache: { enabled: true, maxAge: 60 },
  },

  plugins: [twoFactor({ issuer: "CareFlow · St. Aurora" }), admin()],
});
