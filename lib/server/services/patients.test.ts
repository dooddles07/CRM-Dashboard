import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/server/db";
import { authzSession, ForbiddenError, type AuthzSession } from "@/lib/server/authz/policy";
import { NotFoundError } from "./errors";
import * as patients from "./patients";

/**
 * plan/06-screen-migration.md's Testing Decisions: "One test file per
 * service module ... Cover create, read (list + detail), update,
 * archive/restore, and authorization denial for each." Same runner and
 * assertion style as lib/server/authz/matrix.test.ts, but against the real
 * database that file deliberately avoids — matching scripts/policy-tests.ts's
 * pattern (a live Neon branch, `careflow_owner` for setup reads, real seeded
 * staff rows so the audit writes this module makes have a real `staff.id` to
 * point `actor_id` at).
 *
 * Needs DATABASE_URL (`careflow_app`) and CAREFLOW_OWNER_URL_UNPOOLED set —
 * see drizzle/manual/README.md. Skips itself with a clear message if neither
 * is configured, rather than failing `npm test` for everyone who hasn't
 * provisioned a database.
 */

const ownerUrl = process.env.CAREFLOW_OWNER_URL_UNPOOLED;
const hasDatabase = Boolean(ownerUrl && process.env.DATABASE_URL);

const fixtures = {
  admin: null as { staffId: string; session: AuthzSession } | null,
  viewer: null as { staffId: string; session: AuthzSession } | null,
  editor: null as { staffId: string; session: AuthzSession } | null,
  department: null as { id: string } | null,
  doctor: null as { reference: string } | null,
};

const context = { actorName: "patients.test.ts" };

/** Created inside the tests, deleted in `after` so re-runs stay clean. */
const createdReferences: string[] = [];

describe("patients service (live database)", { skip: !hasDatabase && "DATABASE_URL / CAREFLOW_OWNER_URL_UNPOOLED not set — see drizzle/manual/README.md" }, () => {
  before(async () => {
    // Setup reads only, through careflow_owner — same reason
    // scripts/policy-tests.ts's asOwner exists: careflow_app cannot read
    // anything without a session context, and there is no session yet.
    const owner = createDb(ownerUrl!);

    const staffRows = await owner.execute(sql`
      SELECT id, role FROM staff
      WHERE role IN ('Hospital Admin', 'Marketing', 'Patient Relations')
    `);
    const byRole = new Map(
      (staffRows.rows as { id: string; role: string }[]).map((r) => [r.role, r.id]),
    );
    const adminId = byRole.get("Hospital Admin");
    const viewerId = byRole.get("Marketing");
    const editorId = byRole.get("Patient Relations");
    assert.ok(adminId, "seed: no Hospital Admin staff row — run npm run db:seed");
    assert.ok(viewerId, "seed: no Marketing staff row — run npm run db:seed");
    assert.ok(editorId, "seed: no Patient Relations staff row — run npm run db:seed");

    fixtures.admin = {
      staffId: adminId,
      session: authzSession({ staffId: adminId, role: "Hospital Admin", departmentId: null }),
    };
    fixtures.viewer = {
      staffId: viewerId,
      session: authzSession({ staffId: viewerId, role: "Marketing", departmentId: null }),
    };
    fixtures.editor = {
      staffId: editorId,
      session: authzSession({ staffId: editorId, role: "Patient Relations", departmentId: null }),
    };

    const doctorRows = await owner.execute(sql`
      SELECT reference, department_id FROM doctors WHERE department_id IS NOT NULL LIMIT 1
    `);
    const doctorRow = (doctorRows.rows as { reference: string; department_id: string }[])[0];
    assert.ok(doctorRow, "seed: no doctor with a department — run npm run db:seed");
    fixtures.department = { id: doctorRow.department_id };
    fixtures.doctor = { reference: doctorRow.reference };
  });

  after(async () => {
    if (createdReferences.length === 0) return;
    const owner = createDb(ownerUrl!);
    for (const reference of createdReferences) {
      await owner.execute(sql`DELETE FROM patients WHERE reference = ${reference}`);
    }
  });

  it("creates a patient, resolving department and doctor references", async () => {
    const admin = fixtures.admin!.session;
    const created = await patients.create(
      admin,
      {
        name: "Test Patient Zeta",
        dateOfBirth: "1990-05-15",
        gender: "Female",
        phone: "+639171234567",
        email: "test.zeta@example.com",
        address: "1 Test St, Quezon City",
        emergencyContact: { name: "Test Contact", relation: "Sister", phone: "+639171234568" },
        departmentId: fixtures.department!.id,
        doctorReference: fixtures.doctor!.reference,
        source: "walk-in",
        tags: ["New patient"],
      },
      context,
    );
    createdReferences.push(created.reference);

    assert.match(created.reference, /^PT-\d+$/);
    assert.equal(created.name, "Test Patient Zeta");
    assert.equal(created.status, "new");
    assert.equal(created.department?.id, fixtures.department!.id);
    assert.equal(created.doctor?.reference, fixtures.doctor!.reference);
    assert.deepEqual(created.tags, ["New patient"]);
    // A masked field, never the plaintext — plan/04 §2.1's whole point.
    assert.ok(created.phone.masked.includes("67"));
    assert.doesNotMatch(created.phone.masked, /\+639171234567/);
  });

  it("refuses an unresolvable doctor reference", async () => {
    await assert.rejects(
      () =>
        patients.create(
          fixtures.admin!.session,
          {
            name: "Test Patient Orphan",
            dateOfBirth: "1990-01-01",
            gender: "Other",
            phone: "+639170000000",
            doctorReference: "dr-does-not-exist",
            source: "walk-in",
          },
          context,
        ),
      NotFoundError,
    );
  });

  it("refuses create for a view-only role", async () => {
    await assert.rejects(
      () =>
        patients.create(
          fixtures.viewer!.session,
          { name: "Should Not Exist", dateOfBirth: "1990-01-01", gender: "Other", phone: "+639170000001", source: "walk-in" },
          context,
        ),
      ForbiddenError,
    );
  });

  it("reads the created patient by reference, and lists it by name search", async () => {
    const reference = createdReferences[0];
    const admin = fixtures.admin!.session;

    const detail = await patients.byReference(admin, reference);
    assert.equal(detail.reference, reference);
    assert.equal(detail.source, "walk-in");
    assert.equal(detail.archived, false);

    const page = await patients.list(admin, { search: "Test Patient Zeta" });
    assert.ok(page.data.some((p) => p.reference === reference));
  });

  it("updates a patient and writes a field-level audit entry", async () => {
    const reference = createdReferences[0];
    const updated = await patients.update(
      fixtures.admin!.session,
      reference,
      { insurance: "Test Insurer" },
      context,
    );
    assert.equal(updated.insurance, "Test Insurer");
  });

  it("refuses update for a view-only role", async () => {
    await assert.rejects(
      () => patients.update(fixtures.viewer!.session, createdReferences[0], { insurance: "Nope" }, context),
      ForbiddenError,
    );
  });

  it("archives, excludes from the default list, then restores", async () => {
    const reference = createdReferences[0];
    const admin = fixtures.admin!.session;

    await patients.archive(admin, reference, "Test archive", context);
    const archived = await patients.byReference(admin, reference);
    assert.equal(archived.archived, true);

    const activeList = await patients.list(admin, { search: "Test Patient Zeta" });
    assert.ok(!activeList.data.some((p) => p.reference === reference));

    await patients.restore(admin, reference, context);
    const restored = await patients.byReference(admin, reference);
    assert.equal(restored.archived, false);
  });

  it("refuses archive for a role that holds edit but not full", async () => {
    // Patient Relations: patients "edit" — enough to update, not enough to
    // archive. plan/03 §1: "full adds destructive operations ... on top of
    // edit." This is the boundary between those two levels.
    await assert.rejects(
      () => patients.archive(fixtures.editor!.session, createdReferences[0], "Nope", context),
      ForbiddenError,
    );
  });
});
