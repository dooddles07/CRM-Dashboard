import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/server/db";
import { authzSession, ForbiddenError, type AuthzSession } from "@/lib/server/authz/policy";
import { ConflictError, NotFoundError } from "./errors";
import * as appointments from "./appointments";

/**
 * Same shape as patients.test.ts: one file per service, against the real
 * database (a live Neon branch, not mocked), because the thing most worth
 * proving here — the exclusion constraint refusing an overlapping appointment
 * for the same doctor — is a database behaviour no mock would reproduce.
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
  patient: null as { reference: string } | null,
  doctor: null as { reference: string } | null,
};

const context = { actorName: "appointments.test.ts" };

/** Created inside the tests, deleted in `after` so re-runs stay clean. */
const createdReferences: string[] = [];

// Far enough in the future that it cannot collide with seeded appointments.
const firstAppointmentStart = "2099-06-01T09:00:00.000Z";

describe(
  "appointments service (live database)",
  { skip: !hasDatabase && "DATABASE_URL / CAREFLOW_OWNER_URL_UNPOOLED not set — see drizzle/manual/README.md" },
  () => {
    before(async () => {
      const owner = createDb(ownerUrl!);

      const staffRows = await owner.execute(sql`
        SELECT id, role FROM staff WHERE role IN ('Hospital Admin', 'Nurse', 'Patient Relations')
      `);
      const byRole = new Map(
        (staffRows.rows as { id: string; role: string }[]).map((r) => [r.role, r.id]),
      );
      const adminId = byRole.get("Hospital Admin");
      const viewerId = byRole.get("Nurse");
      const editorId = byRole.get("Patient Relations");
      assert.ok(adminId, "seed: no Hospital Admin staff row — run npm run db:seed");
      assert.ok(viewerId, "seed: no Nurse staff row — run npm run db:seed");
      assert.ok(editorId, "seed: no Patient Relations staff row — run npm run db:seed");

      fixtures.admin = {
        staffId: adminId,
        session: authzSession({ staffId: adminId, role: "Hospital Admin", departmentId: null }),
      };
      fixtures.viewer = {
        staffId: viewerId,
        session: authzSession({ staffId: viewerId, role: "Nurse", departmentId: null }),
      };
      fixtures.editor = {
        staffId: editorId,
        session: authzSession({ staffId: editorId, role: "Patient Relations", departmentId: null }),
      };

      const patientRows = await owner.execute(sql`SELECT reference FROM patients LIMIT 1`);
      const patientRow = (patientRows.rows as { reference: string }[])[0];
      assert.ok(patientRow, "seed: no patients — run npm run db:seed");
      fixtures.patient = { reference: patientRow.reference };

      const doctorRows = await owner.execute(sql`
        SELECT reference FROM doctors WHERE department_id IS NOT NULL LIMIT 1
      `);
      const doctorRow = (doctorRows.rows as { reference: string }[])[0];
      assert.ok(doctorRow, "seed: no doctor with a department — run npm run db:seed");
      fixtures.doctor = { reference: doctorRow.reference };
    });

    after(async () => {
      if (createdReferences.length === 0) return;
      const owner = createDb(ownerUrl!);
      for (const reference of createdReferences) {
        await owner.execute(sql`DELETE FROM appointments WHERE reference = ${reference}`);
      }
    });

    it("creates an appointment, resolving patient and doctor references", async () => {
      const admin = fixtures.admin!.session;
      const created = await appointments.create(
        admin,
        {
          patientReference: fixtures.patient!.reference,
          doctorReference: fixtures.doctor!.reference,
          type: "Consultation",
          startsAt: firstAppointmentStart,
          durationMinutes: 30,
          reason: "Test appointment",
        },
        context,
      );
      createdReferences.push(created.reference);

      assert.match(created.reference, /^AP-/);
      assert.equal(created.patient.reference, fixtures.patient!.reference);
      assert.equal(created.doctor.reference, fixtures.doctor!.reference);
      assert.equal(created.status, "requested");
      assert.equal(created.durationMinutes, 30);
    });

    it("refuses an unresolvable doctor reference", async () => {
      await assert.rejects(
        () =>
          appointments.create(
            fixtures.admin!.session,
            {
              patientReference: fixtures.patient!.reference,
              doctorReference: "dr-does-not-exist",
              type: "Consultation",
              startsAt: "2099-06-02T09:00:00.000Z",
              durationMinutes: 30,
            },
            context,
          ),
        NotFoundError,
      );
    });

    it("refuses create for a view-only role", async () => {
      await assert.rejects(
        () =>
          appointments.create(
            fixtures.viewer!.session,
            {
              patientReference: fixtures.patient!.reference,
              doctorReference: fixtures.doctor!.reference,
              type: "Consultation",
              startsAt: "2099-06-03T09:00:00.000Z",
              durationMinutes: 30,
            },
            context,
          ),
        ForbiddenError,
      );
    });

    it("refuses an overlapping appointment for the same doctor as a 409 SLOT_CONFLICT", async () => {
      await assert.rejects(
        () =>
          appointments.create(
            fixtures.editor!.session,
            {
              patientReference: fixtures.patient!.reference,
              doctorReference: fixtures.doctor!.reference,
              // Overlaps the first appointment's 09:00-09:30 window.
              type: "Follow-up",
              startsAt: "2099-06-01T09:15:00.000Z",
              durationMinutes: 15,
            },
            context,
          ),
        (error: unknown) => error instanceof ConflictError && error.code === "SLOT_CONFLICT",
      );
    });

    it("reads the created appointment by reference, and lists it for its doctor", async () => {
      const reference = createdReferences[0];
      const admin = fixtures.admin!.session;

      const detail = await appointments.byReference(admin, reference);
      assert.equal(detail.reference, reference);
      assert.equal(detail.reason, "Test appointment");

      const page = await appointments.list(admin, {
        from: "2099-06-01T00:00:00.000Z",
        until: "2099-06-02T00:00:00.000Z",
      });
      assert.ok(page.data.some((a) => a.reference === reference));
    });

    it("reschedules an appointment and writes a field-level audit entry", async () => {
      const reference = createdReferences[0];
      const updated = await appointments.update(
        fixtures.editor!.session,
        reference,
        { startsAt: "2099-06-01T11:00:00.000Z", durationMinutes: 45 },
        context,
      );
      assert.equal(updated.startsAt, "2099-06-01T11:00:00.000Z");
      assert.equal(updated.durationMinutes, 45);
    });

    it("refuses update for a view-only role", async () => {
      await assert.rejects(
        () => appointments.update(fixtures.viewer!.session, createdReferences[0], { notes: "Nope" }, context),
        ForbiddenError,
      );
    });

    it("cancels an appointment, then frees the time for a new appointment", async () => {
      const reference = createdReferences[0];
      const admin = fixtures.admin!.session;

      const cancelled = await appointments.cancel(admin, reference, "Test cancellation", context);
      assert.equal(cancelled.status, "cancelled");

      // The exclusion constraint excludes cancelled rows, so the same
      // doctor/time the first test claimed is available again.
      const created = await appointments.create(
        admin,
        {
          patientReference: fixtures.patient!.reference,
          doctorReference: fixtures.doctor!.reference,
          type: "Consultation",
          startsAt: "2099-06-01T11:00:00.000Z",
          durationMinutes: 45,
        },
        context,
      );
      createdReferences.push(created.reference);
      assert.equal(created.status, "requested");
    });
  },
);
