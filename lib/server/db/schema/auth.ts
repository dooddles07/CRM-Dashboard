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
import { inet } from "./columns";
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
 */
export const invitations = pgTable("invitations", {
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
});
