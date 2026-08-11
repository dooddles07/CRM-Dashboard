import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea, inet } from "./columns";
import { departments } from "./org";
import { staff } from "./people";

/**
 * Better Auth's own tables (plan/02-authentication.md §2), kept separate
 * from `staff` per audit risk R8 — `staff.user_id` (people.ts) references
 * `user.id` here, but the two are joined, not merged. Shape matches what
 * Better Auth's drizzle adapter expects for the core tables plus the
 * `twoFactor` and `admin` plugins configured in lib/server/auth/index.ts.
 * `id` columns are TEXT: Better Auth generates its own ids, not UUIDs.
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // admin plugin
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  // twoFactor plugin
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // admin plugin
  impersonatedBy: text("impersonated_by"),
  // plan §4: idle timeout is enforced against this, not against cookie
  // maxAge alone — a cookie's expiry is a client-side hint only.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/**
 * Columns beyond `secret`/`backupCodes`/`userId` (`verified`,
 * `failedVerificationCount`, `lockedUntil`) are required by the `twoFactor`
 * plugin's own schema (node_modules/better-auth/dist/plugins/two-factor/schema.mjs),
 * unconditionally — not gated behind any plugin option. `accountLockout` on
 * that plugin defaults to `enabled: true` and writes `failedVerificationCount`
 * / `lockedUntil` on every verification attempt, so omitting them would fail
 * at runtime the first time someone entered a TOTP code, not at compile time.
 * This is separate from this product's own `auth_attempts` table (§5) — that
 * one counts password/lockout by email+IP, this one is Better Auth's own
 * per-account 2FA-verification lockout.
 */
export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  verified: boolean("verified").notNull().default(true),
  failedVerificationCount: integer("failed_verification_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

/**
 * plan/02-authentication.md §5. Counted twice — per account and per IP —
 * so neither a password-spray across accounts nor a botnet behind many
 * IPs slips past the other counter. Rows older than 30 days are pruned by
 * the nightly job (Phase 07); this table grows fast under attack and
 * nothing needs it long.
 */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email"),
    ip: inet("ip").notNull(),
    outcome: text("outcome").notNull(), // 'success' | 'bad_password' | 'bad_totp' | 'locked'
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_attempts_email").on(table.email, table.at.desc()),
    index("idx_attempts_ip").on(table.ip, table.at.desc()),
  ],
);

/**
 * plan/02-authentication.md §6.2. `role` stays TEXT to match `staff.role`
 * (people.ts) — Phase 01 deferred the nine-role matrix to Phase 03 rather
 * than creating a `staff_role` enum, so this column tracks that decision
 * instead of the plan's literal SQL. The token itself is never stored,
 * only its hash; a plaintext token exists solely in the emailed link.
 *
 * `idx_invitations_token_hash` added in Task 3's fix round (Minor finding)
 * for consistency with the structurally identical
 * `password_reset_tokens.token_hash` index below, which had one from the
 * start — both are looked up by `WHERE token_hash = ?` on every
 * accept/consume call.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    role: text("role").notNull(),
    departmentId: uuid("department_id").references(() => departments.id),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => staff.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_invitations_token_hash").on(table.tokenHash)],
);

/**
 * plan/02-authentication.md §7. The plan doesn't show explicit SQL for this
 * one the way it did for `invitations`/`auth_attempts` — task-3-brief.md
 * §4 asks to check for something reusable first; nothing else in
 * lib/server/db/schema fits (`verification`, above, is Better Auth's own
 * table and this flow deliberately doesn't route through Better Auth's
 * built-in reset-password endpoints, see lib/server/auth/password-reset.ts's
 * header comment), so this is a new table, shaped like `invitations`
 * deliberately: same token/hash/expiry convention (a plaintext token lives
 * only in the emailed/console link, never at rest), `usedAt` playing
 * `invitations.acceptedAt`'s role as the single-use marker. 1 hour expiry
 * (plan §7) is enforced by the caller, not a DB constraint, matching how
 * `invitations.expiresAt` (72h) is checked too.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_password_reset_tokens_hash").on(table.tokenHash)],
);

/**
 * Task 3 fix round (code review, Important finding). `requestPasswordReset`
 * (lib/server/auth/password-reset.ts) must cost about the same wall-clock
 * time whether the submitted email resolves to a real user or not — plan
 * §7's "the response is identical" extends to timing, the same concern
 * plan §5 / Task 2's lockout closed for login with a cost-matched dummy
 * argon2 hash. Matching the *number* of DB round trips (what the first
 * version of this function did) isn't enough: the real found-path does a
 * `pgp_sym_encrypt` call plus two real `INSERT`s (WAL-writing cost); two
 * plain indexed `SELECT`s are cheaper than that on both counts. This table
 * exists purely so the not-found path can perform two real, equally-costly
 * `INSERT`s of its own — no FK, so no real user/email needs to exist for
 * it to accept a row (unlike `password_reset_tokens`, whose `user_id` FK
 * makes a discardable insert impossible for an email that doesn't resolve
 * to anyone). Rows here carry no meaning and are never read back; treat
 * this the same way `auth_attempts` documents itself ("grows fast under
 * attack, nothing needs it long") — Phase 07's nightly job should prune it
 * on the same schedule.
 */
export const authTimingPadding = pgTable("auth_timing_padding", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  data: bytea("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
