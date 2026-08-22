import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/server/db";
import { authzSession, ForbiddenError, type AuthzSession } from "@/lib/server/authz/policy";
import { ConflictError, NotFoundError } from "./errors";
import * as leads from "./leads";

/**
 * 03-leads-followups ticket. Same shape as appointments.test.ts and
 * patients.test.ts: against a live Neon branch, not mocked. The thing most
 * worth proving here is plan §9's rule that a stage move and its
 * `lead_stage_history` row are one transaction, and that conversion is too —
 * neither is visible from TypeScript alone.
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
};

const context = { actorName: "leads.test.ts" };

/** Created inside the tests, deleted in `after` so re-runs stay clean. */
const createdReferences: string[] = [];

describe(
  "leads service (live database)",
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

      // A patient not already linked from a converted lead, so
      // `linkConverted` below is exercised against a clean row.
      const patientRows = await owner.execute(sql`
        SELECT reference FROM patients p
        WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.converted_patient_id = p.id)
        LIMIT 1
      `);
      const patientRow = (patientRows.rows as { reference: string }[])[0];
      assert.ok(patientRow, "seed: no unconverted patient — run npm run db:seed");
      fixtures.patient = patientRow;

      const reference = `LD-TEST-${Date.now()}`;
      await owner.execute(sql`
        INSERT INTO leads (reference, name, source, interest, stage, owner_id, priority, value_cents, inquiry)
        VALUES (${reference}, 'Test Lead', 'website', 'Cardiology consult', 'new', ${editorId}, 'medium', 250000, 'Wants a cardiology consult')
      `);
      createdReferences.push(reference);
    });

    after(async () => {
      if (createdReferences.length === 0) return;
      const owner = createDb(ownerUrl!);
      for (const reference of createdReferences) {
        await owner.execute(sql`DELETE FROM leads WHERE reference = ${reference}`);
      }
    });

    it("reads the lead by reference", async () => {
      const detail = await leads.byReference(fixtures.admin!.session, createdReferences[0]);
      assert.equal(detail.name, "Test Lead");
      assert.equal(detail.stage, "new");
    });

    it("moves the stage and appends a lead_stage_history row", async () => {
      const updated = await leads.moveStage(fixtures.editor!.session, createdReferences[0], "contacted", context);
      assert.equal(updated.stage, "contacted");

      const history = await leads.stageHistory(fixtures.admin!.session, createdReferences[0]);
      assert.ok(history.some((h) => h.from === "new" && h.to === "contacted"));
    });

    it("refuses a stage move for a view-only role", async () => {
      await assert.rejects(
        () => leads.moveStage(fixtures.viewer!.session, createdReferences[0], "qualified", context),
        ForbiddenError,
      );
    });

    it("converts the lead to the fixture patient, in one transaction", async () => {
      const converted = await leads.linkConverted(
        fixtures.editor!.session,
        createdReferences[0],
        fixtures.patient!.reference,
        context,
      );
      assert.equal(converted.stage, "converted");
      assert.equal(converted.convertedPatientReference, fixtures.patient!.reference);
    });

    it("refuses converting an already-converted lead as a 409 CONFLICT", async () => {
      await assert.rejects(
        () =>
          leads.linkConverted(
            fixtures.editor!.session,
            createdReferences[0],
            fixtures.patient!.reference,
            context,
          ),
        (error: unknown) => error instanceof ConflictError && error.code === "CONFLICT",
      );
    });

    it("refuses moving a converted lead back onto the board", async () => {
      await assert.rejects(
        () => leads.moveStage(fixtures.admin!.session, createdReferences[0], "qualified", context),
        (error: unknown) => error instanceof ConflictError && error.code === "CONFLICT",
      );
    });

    it("refuses converting an unresolvable patient reference", async () => {
      const reference = `LD-TEST-${Date.now()}-b`;
      const owner = createDb(ownerUrl!);
      await owner.execute(sql`
        INSERT INTO leads (reference, name, source, stage) VALUES (${reference}, 'Second Test Lead', 'website', 'new')
      `);
      createdReferences.push(reference);

      await assert.rejects(
        () => leads.linkConverted(fixtures.admin!.session, reference, "PT-does-not-exist", context),
        NotFoundError,
      );
    });
  },
);
