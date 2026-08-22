import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/server/db";
import { authzSession, ForbiddenError, type AuthzSession } from "@/lib/server/authz/policy";
import { NotFoundError } from "./errors";
import * as complaints from "./complaints";

/**
 * 04-complaints ticket. Same shape as leads.test.ts: against a live Neon
 * branch, not mocked. The thing most worth proving here is that `breached`
 * and `hoursToBreach` are computed against the database clock (a complaint
 * whose SLA is already in the past reads as breached without the caller
 * comparing anything itself), and that `resolve` stamps `resolved_at` from
 * that same clock rather than trusting a caller-supplied timestamp.
 *
 * Needs DATABASE_URL and CAREFLOW_OWNER_URL_UNPOOLED — see
 * drizzle/manual/README.md. Skips itself when neither is configured.
 */

const ownerUrl = process.env.CAREFLOW_OWNER_URL_UNPOOLED;
const hasDatabase = Boolean(ownerUrl && process.env.DATABASE_URL);

const fixtures = {
  viewer: null as { staffId: string; session: AuthzSession } | null,
  editor: null as { staffId: string; reference: string; session: AuthzSession } | null,
  patient: null as { id: string } | null,
};

const context = { actorName: "complaints.test.ts" };

/** Created inside the tests, deleted in `after` so re-runs stay clean. */
const createdReferences: string[] = [];

describe(
  "complaints service (live database)",
  { skip: !hasDatabase && "DATABASE_URL / CAREFLOW_OWNER_URL_UNPOOLED not set — see drizzle/manual/README.md" },
  () => {
    before(async () => {
      const owner = createDb(ownerUrl!);

      const staffRows = await owner.execute(sql`
        SELECT id, reference, role FROM staff WHERE role IN ('Receptionist', 'Patient Relations')
      `);
      const byRole = new Map(
        (staffRows.rows as { id: string; reference: string; role: string }[]).map((r) => [r.role, r]),
      );
      const viewerRow = byRole.get("Receptionist");
      const editorRow = byRole.get("Patient Relations");
      assert.ok(viewerRow, "seed: no Receptionist staff row — run npm run db:seed");
      assert.ok(editorRow, "seed: no Patient Relations staff row — run npm run db:seed");

      fixtures.viewer = {
        staffId: viewerRow.id,
        session: authzSession({ staffId: viewerRow.id, role: "Receptionist", departmentId: null }),
      };
      fixtures.editor = {
        staffId: editorRow.id,
        reference: editorRow.reference,
        session: authzSession({ staffId: editorRow.id, role: "Patient Relations", departmentId: null }),
      };

      const patientRows = await owner.execute(sql`SELECT id FROM patients LIMIT 1`);
      const patientRow = (patientRows.rows as { id: string }[])[0];
      assert.ok(patientRow, "seed: no patient row — run npm run db:seed");
      fixtures.patient = patientRow;

      // Already past its SLA, so `breached` is provable without waiting.
      const reference = `CS-TEST-${Date.now()}`;
      await owner.execute(sql`
        INSERT INTO complaints (reference, patient_id, subject, description, type, priority, status, sla_due_at)
        VALUES (${reference}, ${patientRow.id}, 'Test complaint', 'A test complaint.', 'Wait time', 'medium', 'new', now() - interval '2 hours')
      `);
      createdReferences.push(reference);
    });

    after(async () => {
      if (createdReferences.length === 0) return;
      const owner = createDb(ownerUrl!);
      for (const reference of createdReferences) {
        await owner.execute(sql`DELETE FROM complaints WHERE reference = ${reference}`);
      }
    });

    it("reads the complaint by reference, breached against the database clock", async () => {
      const detail = await complaints.byReference(fixtures.editor!.session, createdReferences[0]);
      assert.equal(detail.subject, "Test complaint");
      assert.equal(detail.status, "new");
      assert.equal(detail.breached, true);
      // Still open, so hoursToBreach is a real (negative) number, not null —
      // null means resolved, which this case is not yet.
      assert.ok(typeof detail.hoursToBreach === "number" && detail.hoursToBreach < 0);
    });

    it("assigns the case and moves it to investigating", async () => {
      const assigned = await complaints.update(
        fixtures.editor!.session,
        createdReferences[0],
        { status: "assigned", ownerId: fixtures.editor!.staffId },
        context,
      );
      assert.equal(assigned.status, "assigned");
      assert.equal(assigned.owner?.reference, fixtures.editor!.reference);

      const investigating = await complaints.update(
        fixtures.editor!.session,
        createdReferences[0],
        { status: "investigating" },
        context,
      );
      assert.equal(investigating.status, "investigating");
    });

    it("refuses a status change for a view-only role", async () => {
      await assert.rejects(
        () =>
          complaints.update(
            fixtures.viewer!.session,
            createdReferences[0],
            { status: "waiting" },
            context,
          ),
        ForbiddenError,
      );
    });

    it("resolves the case, stamping resolved_at from the database clock", async () => {
      const resolved = await complaints.resolve(
        fixtures.editor!.session,
        createdReferences[0],
        "Explained the delay and apologised.",
        context,
      );
      assert.equal(resolved.status, "resolved");
      assert.equal(resolved.resolution, "Explained the delay and apologised.");
      assert.ok(resolved.resolvedAt);

      // Idempotent: resolving an already-resolved case does not overwrite it.
      const resolvedAgain = await complaints.resolve(
        fixtures.editor!.session,
        createdReferences[0],
        "A different note.",
        context,
      );
      assert.equal(resolvedAgain.resolution, "Explained the delay and apologised.");
    });

    it("closes the case via update, and it drops off the open list", async () => {
      const closed = await complaints.update(
        fixtures.editor!.session,
        createdReferences[0],
        { status: "closed" },
        context,
      );
      assert.equal(closed.status, "closed");

      // Scoped to this one reference rather than the summary aggregate,
      // which drifts on a live, shared table.
      const openPage = await complaints.list(fixtures.editor!.session, { status: "closed", perPage: 100 });
      assert.ok(openPage.data.some((c) => c.reference === createdReferences[0]));
    });

    it("404s on a reference that does not exist", async () => {
      await assert.rejects(
        () => complaints.byReference(fixtures.editor!.session, "CS-does-not-exist"),
        NotFoundError,
      );
    });
  },
);
