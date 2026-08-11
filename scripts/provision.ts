/**
 * plan/02-authentication.md §6.1, task-3-brief.md §1.
 *
 * npm run provision -- --email you@example.com --name "…" --role "Hospital Admin" [--force]
 *
 * Creates the first account for an environment: a `user` row (no
 * credential yet) and its `staff` row, in one transaction, then issues
 * that same email an invitation-shaped enrolment link (§2's mechanism,
 * reused rather than duplicated — see lib/server/auth/invitations.ts's
 * `acceptInvitation` header comment for how it recognises this case) and
 * prints the link. Refuses to run if any `staff` row already has
 * `role = 'Hospital Admin'`, regardless of that row's `status` — an
 * existing admin, even an uninvited seeded placeholder one from
 * `scripts/seed.ts`, still blocks this by default — unless `--force` is
 * given.
 *
 * Modelled on `scripts/seed.ts`'s conventions: `dotenv/config`,
 * `createDb(process.env.DATABASE_URL_UNPOOLED)`, `generateReference`.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "../lib/server/db";
import * as schema from "../lib/server/db/schema";
import { createBareUser, initialsFromName } from "../lib/server/auth/credentials";
import { createInvitation } from "../lib/server/auth/invitations";
import { isKnownStaffRole, KNOWN_STAFF_ROLES } from "../lib/server/auth/roles";
import { generateReference } from "../lib/server/db/reference";
import { emailDomainOf, encryptPiiRequired } from "../lib/server/db/pii";

const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED;
if (!DATABASE_URL_UNPOOLED) {
  throw new Error("provision: DATABASE_URL_UNPOOLED is not set.");
}
const db = createDb(DATABASE_URL_UNPOOLED);

interface Args {
  email: string;
  name: string;
  role: string;
  force: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx === -1 ? undefined : argv[idx + 1];
  };

  const email = get("--email");
  const name = get("--name");
  const role = get("--role");
  const force = argv.includes("--force");

  if (!email || !name || !role) {
    console.error('Usage: npm run provision -- --email you@example.com --name "…" --role "Hospital Admin" [--force]');
    process.exit(1);
  }

  return { email, name, role, force };
}

async function main() {
  const { email, name, role, force } = parseArgs();

  if (!isKnownStaffRole(role)) {
    console.error(`provision: unknown role "${role}". Known roles: ${KNOWN_STAFF_ROLES.join(", ")}`);
    process.exit(1);
  }

  // plan §6.1: "refuses to run if any Hospital Admin already exists,
  // unless --force is given" — checked regardless of `status`, so an
  // uninvited seeded placeholder (scripts/seed.ts's Isabel Domingo,
  // status 'invited') still blocks a second unforced run.
  const [existingAdmin] = await db
    .select({ id: schema.staff.id, name: schema.staff.name })
    .from(schema.staff)
    .where(eq(schema.staff.role, "Hospital Admin"))
    .limit(1);
  if (existingAdmin && !force) {
    console.error(
      `provision: a Hospital Admin already exists (${existingAdmin.name}). Re-run with --force to provision another.`,
    );
    process.exit(1);
  }

  const [existingUser] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (existingUser) {
    console.error(`provision: a user with email ${email} already exists.`);
    process.exit(1);
  }

  const { staffId } = await db.transaction(async (tx) => {
    const { userId } = await createBareUser(tx, { email, name });

    const reference = await generateReference("staff", async (candidate) => {
      const [row] = await tx.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.reference, candidate)).limit(1);
      return !!row;
    });

    const [staffRow] = await tx
      .insert(schema.staff)
      .values({
        reference,
        userId,
        name,
        initials: initialsFromName(name),
        role,
        departmentId: null,
        emailEncrypted: encryptPiiRequired(email),
        emailDomain: emailDomainOf(email),
        // Not yet usable — no `account`/credential row and no TOTP enrolled.
        // Flips to 'active' when the enrolment link below is completed;
        // see lib/server/auth/invitations.ts's `acceptInvitation`.
        status: "invited",
        mfaEnabled: false,
        joinedAt: new Date().toISOString().slice(0, 10),
      })
      .returning({ id: schema.staff.id });

    return { userId, staffId: staffRow!.id };
  });

  // §1: "reuse the invitation-acceptance mechanism ... rather than
  // building a second, parallel enrolment path." `invitedBy` is
  // self-referential — there is no other staff row to attribute a
  // bootstrap invitation to, and that's an honest description of what
  // this is.
  const { link, expiresAt } = await createInvitation({
    email,
    role,
    departmentId: null,
    invitedByStaffId: staffId,
  });

  console.log(`provision: created ${role} account for ${email} (staff ${staffId}).`);
  console.log(`provision: single-use enrolment link (expires ${expiresAt.toISOString()}):`);
  console.log(`  ${link}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
