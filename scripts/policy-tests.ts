/**
 * plan/03-authorisation.md §5.3. The row-level-security suite.
 *
 * Run with `npm run test:policies` against a database that has
 * drizzle/manual/0007_row_level_security.sql applied and `npm run db:seed`
 * loaded. Separate from `npm test` because it needs both of those; the
 * matrix/policy suite (lib/server/authz/matrix.test.ts) needs neither and
 * runs on every change.
 *
 * plan §5.3 is the reason this asserts counts rather than absence of
 * exceptions:
 *
 *   "A wrong policy does not error — it returns zero rows, and a screen
 *    showing an empty state looks like a data problem rather than a
 *    permissions bug. The mitigation is that policy tests assert counts, not
 *    absence of exceptions."
 *
 * Every expected number is derived from lib/data/people.ts — the same
 * fixtures scripts/seed.ts loads — rather than written down here, so
 * changing the seed changes the expectations with it instead of turning this
 * suite red for the wrong reason. plan §5.3's own worked example says
 * "as Nurse/pediatrics -> patients: exactly 4"; the seed actually puts 3
 * patients in Pediatrics, which is exactly the kind of drift deriving them
 * avoids.
 *
 * Reads only. Every write this suite attempts happens inside a transaction
 * that is rolled back, and the writes it attempts are the ones it expects to
 * be refused.
 */
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import { createDb } from "../lib/server/db";
import { applySessionContext, type Tx } from "../lib/server/db/session";
import { authzSession, type AuthzSession } from "../lib/server/authz/policy";
import { DEPARTMENT_SCOPE, ROLES, type Role } from "../lib/server/authz/matrix";
import { patients as patientFixtures, staff as staffFixtures } from "../lib/data/people";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!URL) {
  console.error(
    "policy-tests: DATABASE_URL_UNPOOLED is not set. This suite needs a seeded database with\n" +
      "drizzle/manual/0007_row_level_security.sql applied. See drizzle/manual/README.md.",
  );
  process.exit(1);
}

const db = createDb(URL);

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}\n         expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  FAIL ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * A session context on this suite's own connection, rolled back afterwards.
 *
 * Uses the same `applySessionContext` the application's `withSession` uses,
 * so this is a test of the real mechanism rather than of a lookalike. The
 * rollback is unconditional: nothing here should leave a row behind, and a
 * refused write must not become a passing test by way of an empty table.
 */
async function as<T>(session: AuthzSession, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sentinel = Symbol("rollback");
  let result!: T;
  try {
    await db.transaction(async (tx) => {
      await applySessionContext(tx, session);
      result = await fn(tx);
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  return result;
}

async function count(tx: Tx, table: string, where = "true"): Promise<number> {
  const rows = await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`));
  return (rows.rows[0] as { n: number }).n;
}

/** Did this throw, and what did Postgres actually say? */
async function refused(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "no error";
  } catch (error) {
    return messageChain(error);
  }
}

/**
 * Every message in the `cause` chain, joined.
 *
 * Reading `error.message` alone is not enough and silently inverts every
 * assertion in this file that matches on the text. Drizzle wraps a driver
 * failure in a `DrizzleQueryError` whose own message is
 * `Failed query: SELECT ...` and hangs the real one on `.cause`:
 *
 *   [0] DrizzleQueryError: Failed query: SELECT count(*) FROM patients
 *   [1] DatabaseError:     app.role is not set: this query ran outside withSession()
 *
 * So a correctly-refused query looks like a passing query to a regex over
 * the top-level message, and the suite reports the database as broken when
 * the database is right. That is the worst possible failure mode for a test
 * whose entire job is proving that access is denied — it fails open in the
 * reporting, not just in the check.
 */
function messageChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const step = current as Error & { cause?: unknown };
    if (step.message) parts.push(step.message.split("\n")[0]);
    current = step.cause;
  }
  return parts.length > 0 ? parts.join(" | ") : String(error);
}

function session(role: Role, departmentId: string | null): AuthzSession {
  return authzSession({
    staffId: "00000000-0000-0000-0000-000000000001",
    role,
    departmentId,
  });
}

/* -------------------------------------------------------------------------- */
/* Expected counts, derived from the seed fixtures                            */
/* -------------------------------------------------------------------------- */

const TOTAL_PATIENTS = patientFixtures.length;

/** Seeded patients per department slug. */
const patientsPerDepartment = new Map<string, number>();
for (const patient of patientFixtures) {
  if (!patient.departmentId) continue;
  patientsPerDepartment.set(
    patient.departmentId,
    (patientsPerDepartment.get(patient.departmentId) ?? 0) + 1,
  );
}

async function main(): Promise<void> {
  const who = await db.execute(sql`SELECT current_user AS role`);
  const connectedAs = (who.rows[0] as { role: string }).role;
  if (connectedAs !== "careflow_app") {
    console.error(
      `policy-tests: connected as "${connectedAs}", not careflow_app.\n` +
        "Row-level security is FORCE'd but careflow_owner holds an explicit permissive policy\n" +
        "(drizzle/manual/0007_row_level_security.sql §7.5), so a run as the owner would pass every\n" +
        "assertion below whether or not the policies work. Point DATABASE_URL_UNPOOLED at\n" +
        "careflow_app credentials.",
    );
    process.exit(1);
  }
  console.log(`policy-tests: connected as ${connectedAs}\n`);

  // Department slugs resolve to ids the policies actually compare against.
  const departmentRows = await db.execute(sql`SELECT id, slug FROM departments`);
  const departmentIdBySlug = new Map(
    (departmentRows.rows as { id: string; slug: string }[]).map((row) => [row.slug, row.id]),
  );

  console.log("Patient row counts per role (plan §5.3)");
  for (const role of ROLES) {
    if (DEPARTMENT_SCOPE[role] === "all") {
      const n = await as(session(role, null), (tx) => count(tx, "patients"));
      check(`${role} sees every patient`, n, TOTAL_PATIENTS);
    } else {
      for (const [slug, expected] of patientsPerDepartment) {
        const departmentId = departmentIdBySlug.get(slug);
        if (!departmentId) {
          failures.push(`department "${slug}" is in the fixtures but not in the database`);
          continue;
        }
        const n = await as(session(role, departmentId), (tx) => count(tx, "patients"));
        check(`${role} in ${slug} sees only ${slug}`, n, expected);
      }
    }
  }

  console.log("\nCross-department reads return nothing, not an error (plan §5.3)");
  {
    const pediatrics = departmentIdBySlug.get("pediatrics")!;
    const cardiology = departmentIdBySlug.get("cardiology")!;
    const n = await as(session("Nurse", pediatrics), (tx) =>
      count(tx, "patients", `department_id = '${cardiology}'`),
    );
    check("Nurse/pediatrics sees 0 cardiology patients", n, 0);

    // plan §8: "The same Nurse requesting a Cardiology patient by reference
    // gets 404, not 403 — out of scope is indistinguishable from not
    // existing." At this layer that is the row simply not being there.
    const byReference = await as(session("Nurse", pediatrics), async (tx) => {
      const rows = await tx.execute(
        sql`SELECT reference FROM patients WHERE department_id = ${cardiology} LIMIT 1`,
      );
      return rows.rows.length;
    });
    check("a cardiology patient is not fetchable by reference either", byReference, 0);
  }

  console.log("\nDependent tables inherit the patient's scope");
  {
    const pediatrics = departmentIdBySlug.get("pediatrics")!;
    const scoped = session("Nurse", pediatrics);
    const unscoped = session("Hospital Admin", null);
    for (const table of [
      "appointments",
      "follow_ups",
      "conversations",
      "messages",
      "complaints",
      "feedback",
      "patient_notes",
      "patient_documents",
    ]) {
      const all = await as(unscoped, (tx) => count(tx, table));
      const mine = await as(scoped, (tx) => count(tx, table));
      check(`${table}: Nurse/pediatrics sees fewer rows than Hospital Admin`, mine < all, true);
      check(`${table}: Hospital Admin sees a non-empty table`, all > 0, true);
    }
  }

  console.log("\nA query outside withSession fails rather than returning rows (plan §8)");
  {
    const message = await refused(() => db.execute(sql`SELECT count(*) FROM patients`));
    check("bare SELECT on patients raises", /app\.role is not set/.test(message), true);

    // The failure has to survive a pooled connection that already served a
    // session — the placeholder GUC persists as an empty string once set.
    await as(session("Hospital Admin", null), (tx) => count(tx, "patients"));
    const again = await refused(() => db.execute(sql`SELECT count(*) FROM patients`));
    check("...and still raises on the same connection afterwards", /app\.role is not set/.test(again), true);
  }

  console.log("\nWrites restate the matrix (plan §5.2)");
  {
    const cardiology = departmentIdBySlug.get("cardiology")!;
    // Receptionist holds `patients: view`, so an UPDATE must match no rows.
    const touched = await as(session("Receptionist", null), async (tx) => {
      const result = await tx.execute(sql`UPDATE patients SET notes = 'policy-test' WHERE true`);
      return result.rowCount ?? 0;
    });
    check("Receptionist cannot update any patient", touched, 0);

    // A Nurse can edit, but only inside their own department.
    const pediatrics = departmentIdBySlug.get("pediatrics")!;
    const own = await as(session("Nurse", pediatrics), async (tx) => {
      const result = await tx.execute(sql`UPDATE patients SET notes = 'policy-test' WHERE true`);
      return result.rowCount ?? 0;
    });
    check("Nurse updates only their own department", own, patientsPerDepartment.get("pediatrics"));

    const other = await as(session("Nurse", pediatrics), async (tx) => {
      const result = await tx.execute(
        sql`UPDATE patients SET notes = 'policy-test' WHERE department_id = ${cardiology}`,
      );
      return result.rowCount ?? 0;
    });
    check("Nurse cannot update another department", other, 0);
  }

  console.log("\nnotifications are per-staff (plan §5.2)");
  {
    const [someStaff] = staffFixtures;
    const staffRow = await db.execute(
      sql`SELECT id FROM staff WHERE reference = ${someStaff.id} LIMIT 1`,
    );
    const staffId = (staffRow.rows[0] as { id: string } | undefined)?.id;
    if (!staffId) {
      failures.push(`staff fixture ${someStaff.id} is not in the database — is it seeded?`);
    } else {
      const mine = await as(
        authzSession({ staffId, role: "Hospital Admin", departmentId: null }),
        (tx) => count(tx, "notifications"),
      );
      const others = await as(
        authzSession({ staffId, role: "Hospital Admin", departmentId: null }),
        (tx) => count(tx, "notifications", `staff_id <> '${staffId}'`),
      );
      check("a staff member sees their own notifications", mine > 0, true);
      check("...and none of anyone else's", others, 0);
    }
  }

  console.log("\naudit_log is append-only and read by audit:read holders only (plan §5.2, §6, §8)");
  {
    const asAdmin = session("Super Admin", null);
    const visible = await as(asAdmin, (tx) => count(tx, "audit_log"));
    check("Super Admin can read the audit log", visible > 0, true);

    const asMarketing = session("Marketing", null);
    const hidden = await as(asMarketing, (tx) => count(tx, "audit_log"));
    check("Marketing sees no audit entries", hidden, 0);

    const updateError = await refused(() =>
      as(asAdmin, (tx) => tx.execute(sql`UPDATE audit_log SET actor_name = 'x' WHERE true`)),
    );
    check("careflow_app cannot UPDATE audit_log", /permission denied/i.test(updateError), true);

    const deleteError = await refused(() =>
      as(asAdmin, (tx) => tx.execute(sql`DELETE FROM audit_log WHERE true`)),
    );
    check("careflow_app cannot DELETE from audit_log", /permission denied/i.test(deleteError), true);

    // The same, addressed at a partition directly — the hole
    // drizzle/manual/0005_grants.sql left open, since grants are per-relation.
    const parts = await db.execute(
      sql`SELECT inhrelid::regclass::text AS name FROM pg_inherits WHERE inhparent = 'audit_log'::regclass`,
    );
    for (const row of parts.rows as { name: string }[]) {
      const error = await refused(() =>
        as(asAdmin, (tx) => tx.execute(sql.raw(`DELETE FROM ${row.name} WHERE true`))),
      );
      check(`careflow_app cannot DELETE from ${row.name}`, /permission denied/i.test(error), true);
    }
  }

  console.log("\nstaff role integrity (§1 of the migration)");
  {
    const badRole = await refused(() =>
      db.execute(sql`UPDATE staff SET role = 'Administrator' WHERE true`),
    );
    check("an unknown role is refused by staff_role_known", /staff_role_known/.test(badRole), true);
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`policy-tests: ${passed} passed, ${failures.length} FAILED\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`policy-tests: ${passed} passed.`);
}

main().catch((error) => {
  console.error("policy-tests: crashed.", error);
  process.exit(1);
});
