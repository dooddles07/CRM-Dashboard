import { generateId } from "@better-auth/core/utils/id";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { ARGON2_PARAMS } from "./index";
import type { Database } from "@/lib/server/db";
import { account, user } from "@/lib/server/db/schema/auth";

/**
 * Task 3's shared low-level primitives for anything that needs to create or
 * update a Better Auth credential (`user` + `account`) row outside of
 * Better Auth's own HTTP-style `auth.api.*` surface.
 *
 * Why not `auth.api.createUser` (the `admin` plugin's endpoint, the one
 * documented escape hatch around `emailAndPassword.disableSignUp` — see
 * node_modules/better-auth/dist/plugins/admin/routes.mjs's `createUser`,
 * which calls `internalAdapter.createUser` + `internalAdapter.linkAccount`
 * and, called server-side with no `headers`/`request` on the call options,
 * skips its own session/permission check): because task-3-brief.md's
 * accept-invitation flow needs "one transaction ... if any step fails,
 * nothing commits" spanning `user`, `account`, `staff`, and `invitations`
 * together, and `auth.api.*` calls run against the module-level `db`
 * export (lib/server/auth/index.ts's `drizzleAdapter(db, ...)`), not
 * against whatever local `tx` a caller's own `db.transaction()` opened —
 * there is no way to hand Better Auth's adapter a specific transaction
 * object through that call path. Doing the inserts directly, with
 * everything running through the same `tx`, is what actually makes the
 * "half-accepted invitation is not a state the system can be in"
 * requirement true. Shapes below are verified against what
 * `internalAdapter.createUser`/`linkAccount` themselves write (
 * node_modules/better-auth/dist/db/internal-adapter.mjs,
 * node_modules/better-auth/dist/api/routes/sign-up.mjs's
 * `accountId: createdUser.id, providerId: "credential"`), not guessed.
 */
type Transaction = Parameters<Database["transaction"]>[0] extends (tx: infer T, ...args: never[]) => unknown ? T : never;
type Queryable = Database | Transaction;

/**
 * Creates a Better Auth `user` row with no credential yet — provisioning's
 * case (task-3-brief.md §1): the account exists (so the staff-resolution
 * invariant in ./index.ts's `databaseHooks` is satisfiable once a `staff`
 * row is added in the same transaction) but cannot sign in until a
 * password is set via the enrolment-link flow, because no `account` row
 * exists for it to verify a password against.
 */
export async function createBareUser(
  tx: Queryable,
  params: { email: string; name: string },
): Promise<{ userId: string }> {
  const userId = generateId();
  await tx.insert(user).values({
    id: userId,
    name: params.name,
    email: params.email,
    emailVerified: false,
    twoFactorEnabled: false,
  });
  return { userId };
}

/** `hash()` with this codebase's one set of argon2id parameters — same call `lib/server/auth/index.ts`'s `emailAndPassword.password.hash` makes. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

/**
 * Attaches a `credential` (`providerId: "credential"`) account to
 * `userId`, or replaces its password if one already exists. Covers both:
 *  - a brand-new invitation acceptance (no `account` row yet — insert), and
 *  - completing a provisioning enrolment link or a password reset against
 *    a `user` that already has a credential (update in place).
 */
export async function upsertCredentialAccount(
  tx: Queryable,
  params: { userId: string; password: string },
): Promise<void> {
  const passwordHash = await hashPassword(params.password);
  const [existing] = await tx
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, params.userId), eq(account.providerId, "credential")))
    .limit(1);

  if (existing) {
    await tx.update(account).set({ password: passwordHash, updatedAt: new Date() }).where(eq(account.id, existing.id));
  } else {
    await tx.insert(account).values({
      id: generateId(),
      accountId: params.userId,
      providerId: "credential",
      userId: params.userId,
      password: passwordHash,
    });
  }
}

/**
 * `staff.initials` has no derivation helper elsewhere — `scripts/seed.ts`
 * takes it straight from fixture data, which doesn't exist for a
 * provisioned or invited account. First letter of up to the first two
 * words of the name, uppercased (`"Isabel Domingo"` → `"ID"`, matching the
 * fixtures' own convention).
 */
export function initialsFromName(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}
