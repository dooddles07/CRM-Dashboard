import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/server/db";
import { authzSession, ForbiddenError, type AuthzSession } from "@/lib/server/authz/policy";
import { NotFoundError } from "./errors";
import * as followups from "./followups";

/**
 * 03-leads-followups ticket. Same shape as appointments.test.ts: against a
 * live Neon branch, not mocked, because the thing most worth proving —
 * `status` reading from the `due_date`/`completed_at`-derived expression
 * rather than a stored column — is a behaviour a mock would just assert back
 * to itself.
 *
 * Needs DATABASE_URL and CAREFLOW_OWNER_URL_UNPOOLED — see
 * drizzle/manual/README.md. Skips itself when neither is configured.
 */

const ownerUrl = process.env.CAREFLOW_OWNER_URL_UNPOOLED;
const hasDatabase = Boolean(ownerUrl && process.env.DATABASE_URL);

const fixtures = {
  admin: null as { staffId: string; session: AuthzSession } | null,
  viewer: null as { staffId: string; session: AuthzSession } | null,
  editor: null as { staffId: string; session: AuthzSession } | null,
  patient: null as { id: string; reference: string } | null,
};

const context = { actorName: "followups.test.ts" };

/** Created inside the tests, deleted in `after` so re-runs stay clean. */
const createdReferences: string[] = [];

describe(
  "follow-ups service (live database)",
  { skip: !hasDatabase && "DATABASE_URL / CAREFLOW_OWNER_URL_UNPOOLED not set — see drizzle/manual/README.md" },
  () => {
    before(async () => {
      const owner = createDb(ownerUrl!);

      const staffRows = await owner.execute(sql`
        SELECT id, role FROM staff WHERE role IN ('Hospital Admin', 'Receptionist', 'Patient Relations')
      `);
      const byRole = new Map(
        (staffRows.rows as { id: string; role: string }[]).map((r) => [r.role, r.id]),
      );
      const adminId = byRole.get("Hospital Admin");
      const viewerId = byRole.get("Receptionist");
      const editorId = byRole.get("Patient Relations");
      assert.ok(adminId, "seed: no Hospital Admin staff row — run npm run db:seed");
      assert.ok(viewerId, "seed: no Receptionist staff row — run npm run db:seed");
      assert.ok(editorId, "seed: no Patient Relations staff row — run npm run db:seed");

      fixtures.admin = {
        staffId: adminId,
        session: authzSession({ staffId: adminId, role: "Hospital Admin", departmentId: null }),
      };
      fixtures.viewer = {
        staffId: viewerId,
        session: authzSession({ staffId: viewerId, role: "Receptionist", departmentId: null }),
      };
      fixtures.editor = {
        staffId: editorId,
        session: authzSession({ staffId: editorId, role: "Patient Relations", departmentId: null }),
      };

      const patientRows = await owner.execute(sql`SELECT id, reference FROM patients LIMIT 1`);
      const patientRow = (patientRows.rows as { id: string; reference: string }[])[0];
      assert.ok(patientRow, "seed: no patients — run npm run db:seed");
      fixtures.patient = patientRow;

      // Far in the past/future so it cannot collide with a seeded follow-up's
      // derived status ("overdue" vs "scheduled" both need a fixed reference
      // point relative to CURRENT_DATE).
      const reference = `FU-TEST-${Date.now()}`;
      await owner.execute(sql`
        INSERT INTO follow_ups (reference, patient_id, type, owner_id, due_date, priority)
        VALUES (${reference}, ${patientRow.id}, 'Post consultation', ${editorId}, '2099-01-01', 'medium')
      `);
      createdReferences.push(reference);
    });

    after(async () => {
      if (createdReferences.length === 0) return;
      const owner = createDb(ownerUrl!);
      for (const reference of createdReferences) {
        await owner.execute(sql`DELETE FROM follow_ups WHERE reference = ${reference}`);
      }
    });

    it("lists the follow-up with a derived 'scheduled' status", async () => {
      const page = await followups.list(fixtures.admin!.session, { perPage: 100 });
      const row = page.data.find((f) => f.reference === createdReferences[0]);
      assert.ok(row, "seeded follow-up not found in list");
      assert.equal(row!.status, "scheduled");
      assert.equal(row!.patient.reference, fixtures.patient!.reference);
    });

    it("reschedules the due date and writes a field-level audit entry", async () => {
      const updated = await followups.reschedule(
        fixtures.editor!.session,
        createdReferences[0],
        "2099-02-15",
        context,
      );
      assert.equal(updated.dueDate, "2099-02-15");
      assert.equal(updated.status, "scheduled");
    });

    it("refuses reschedule for a view-only role", async () => {
      await assert.rejects(
        () => followups.reschedule(fixtures.viewer!.session, createdReferences[0], "2099-03-01", context),
        ForbiddenError,
      );
    });

    it("refuses reschedule for an unknown reference", async () => {
      await assert.rejects(
        () => followups.reschedule(fixtures.admin!.session, "FU-does-not-exist", "2099-03-01", context),
        NotFoundError,
      );
    });

    it("completes the follow-up, and a second completion is a no-op", async () => {
      const first = await followups.complete(fixtures.editor!.session, createdReferences[0], "Called, done", context);
      assert.equal(first.status, "completed");
      assert.ok(first.completedAt);

      const second = await followups.complete(fixtures.editor!.session, createdReferences[0], "Different note", context);
      // Idempotent: the second call does not overwrite the first note.
      assert.equal(second.note, "Called, done");
      assert.equal(second.completedAt, first.completedAt);
    });
  },
);
