import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  AREAS,
  type Area,
  CAPABILITIES,
  DEPARTMENT_SCOPE,
  LEVELS,
  type Level,
  ROLES,
  ROLE_CAPABILITIES,
  ROLE_MATRIX,
  type Role,
  UNSCOPED_ROLES,
} from "./matrix";
import {
  ForbiddenError,
  UnknownRoleError,
  assertExport,
  assertHolds,
  assert as assertLevel,
  authzSession,
  can,
  canExport,
  holds,
  isDepartmentScoped,
  permissionSet,
} from "./policy";

/**
 * plan/03-authorisation.md §5.2 puts the department-scope rules in two
 * languages — TypeScript in ./matrix.ts, SQL in
 * drizzle/manual/0007_row_level_security.sql — and nothing in either file
 * can see the other. This suite is what stops them drifting: it re-derives
 * every role list in the migration from the matrix and compares.
 *
 * No database. `npm test` runs this on every change; the counted-rows suite
 * that needs a live Postgres is scripts/policy-tests.ts (`npm run
 * test:policies`).
 */

const SQL = readFileSync(
  join(__dirname, "..", "..", "..", "drizzle", "manual", "0007_row_level_security.sql"),
  "utf8",
);

/** Every single-quoted literal inside a named SQL function's `$$ ... $$` body. */
function rolesInFunction(name: string): string[] {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\(\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`);
  const match = SQL.match(re);
  assert.ok(match, `0007_row_level_security.sql has no function ${name}()`);
  return literals(match[1]);
}

/** Every single-quoted literal inside a named CHECK constraint. */
function rolesInConstraint(name: string): string[] {
  const re = new RegExp(`ADD CONSTRAINT ${name} CHECK \\(([\\s\\S]*?)\\n\\);`);
  const match = SQL.match(re);
  assert.ok(match, `0007_row_level_security.sql has no constraint ${name}`);
  return literals(match[1]);
}

function literals(body: string): string[] {
  return (body.match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1)).sort();
}

function rolesWithAtLeast(area: Area, level: Level): string[] {
  return ROLES.filter(
    (role) => LEVELS.indexOf(ROLE_MATRIX[role][area]) >= LEVELS.indexOf(level),
  )
    .slice()
    .sort();
}

const sorted = (values: readonly string[]) => values.slice().sort();

/** A session per role, department-scoped ones given a department. */
function sessionFor(role: Role, departmentId: string | null = "dept-1") {
  return authzSession({
    staffId: "staff-1",
    role,
    departmentId: DEPARTMENT_SCOPE[role] === "own-department" ? (departmentId ?? "dept-1") : null,
  });
}

describe("the matrix itself", () => {
  it("covers every area for every role", () => {
    for (const role of ROLES) {
      for (const area of AREAS) {
        assert.ok(
          LEVELS.includes(ROLE_MATRIX[role][area]),
          `${role} has no level for ${area}`,
        );
      }
      assert.ok(role in ROLE_CAPABILITIES, `${role} has no capability list`);
      assert.ok(role in DEPARTMENT_SCOPE, `${role} has no department scope`);
    }
  });

  it("declares the same nine roles as lib/types.ts", () => {
    const types = readFileSync(join(__dirname, "..", "..", "types.ts"), "utf8");
    const union = types.match(/export type StaffRole =([\s\S]*?);/);
    assert.ok(union, "lib/types.ts has no StaffRole union");
    const declared = (union[1].match(/"([^"]+)"/g) ?? []).map((s) => s.slice(1, -1)).sort();
    assert.deepEqual(declared, sorted(ROLES));
  });

  it("orders levels weakest to strongest, which policy.ts compares by index", () => {
    assert.deepEqual([...LEVELS], ["none", "view", "edit", "full"]);
  });

  it("withholds reveal from exactly Marketing and Billing (plan §2.1)", () => {
    const without = ROLES.filter((role) => !ROLE_CAPABILITIES[role].includes("reveal"));
    assert.deepEqual(sorted(without), ["Billing", "Marketing"]);
  });

  it("grants export to exactly the four roles in plan §2.2", () => {
    const withExport = ROLES.filter((role) => ROLE_CAPABILITIES[role].includes("export"));
    assert.deepEqual(sorted(withExport), [
      "Hospital Admin",
      "Manager",
      "Patient Relations",
      "Super Admin",
    ]);
  });

  it("grants audit:read to exactly Super Admin and Hospital Admin (plan §2.3)", () => {
    const withAudit = ROLES.filter((role) => ROLE_CAPABILITIES[role].includes("audit:read"));
    assert.deepEqual(sorted(withAudit), ["Hospital Admin", "Super Admin"]);
  });

  it("declares no audit:write or audit:delete capability (plan §2.3)", () => {
    assert.deepEqual(sorted(CAPABILITIES), ["audit:read", "export", "reveal"]);
  });
});

describe("the SQL restates the matrix without drifting from it", () => {
  it("app_sees_all_departments() lists the all-department roles", () => {
    assert.deepEqual(rolesInFunction("app_sees_all_departments"), sorted(UNSCOPED_ROLES));
  });

  it("app_can_edit_patients() lists the roles holding patients >= edit", () => {
    assert.deepEqual(rolesInFunction("app_can_edit_patients"), rolesWithAtLeast("patients", "edit"));
  });

  it("app_can_edit_appointments() lists the roles holding appointments >= edit", () => {
    assert.deepEqual(
      rolesInFunction("app_can_edit_appointments"),
      rolesWithAtLeast("appointments", "edit"),
    );
  });

  it("app_can_edit_pipeline() lists the roles holding pipeline >= edit", () => {
    assert.deepEqual(rolesInFunction("app_can_edit_pipeline"), rolesWithAtLeast("pipeline", "edit"));
  });

  it("app_holds_audit_read() lists the audit:read holders", () => {
    const holders = ROLES.filter((role) => ROLE_CAPABILITIES[role].includes("audit:read"));
    assert.deepEqual(rolesInFunction("app_holds_audit_read"), sorted(holders));
  });

  it("staff_role_known constrains the column to the nine roles", () => {
    assert.deepEqual(rolesInConstraint("staff_role_known"), sorted(ROLES));
  });

  it("staff_department_required names exactly the department-scoped roles", () => {
    const scoped = ROLES.filter((role) => DEPARTMENT_SCOPE[role] === "own-department");
    assert.deepEqual(rolesInConstraint("staff_department_required"), sorted(scoped));
  });

  it("forces row-level security wherever it enables it (plan §8)", () => {
    const enabled = [...SQL.matchAll(/ALTER TABLE (\w+) ENABLE\s+ROW LEVEL SECURITY/g)].map(
      (m) => m[1],
    );
    const forced = [...SQL.matchAll(/ALTER TABLE (\w+) FORCE\s+ROW LEVEL SECURITY/g)].map(
      (m) => m[1],
    );
    assert.ok(enabled.length >= 15, `only ${enabled.length} tables have RLS enabled`);
    assert.deepEqual(sorted(enabled), sorted(forced));
  });

  it("gives audit_log no UPDATE or DELETE policy (plan §5.2)", () => {
    const auditPolicies = [...SQL.matchAll(/CREATE POLICY (audit_log\w*) ON \S+ FOR (\w+)/g)];
    assert.ok(auditPolicies.length > 0, "no audit_log policies found");
    for (const [, name, command] of auditPolicies) {
      // FOR ALL would include UPDATE and DELETE, which is the whole point of
      // the table being append-only.
      assert.ok(
        command === "SELECT" || command === "INSERT",
        `policy ${name} is FOR ${command}; audit_log takes SELECT and INSERT only`,
      );
    }
  });

  it("revokes UPDATE and DELETE on audit_log from both application roles (plan §6)", () => {
    assert.match(SQL, /REVOKE UPDATE, DELETE ON audit_log FROM careflow_app, careflow_readonly;/);
    // ...and from every partition, which drizzle/manual/0005_grants.sql missed.
    assert.match(SQL, /REVOKE UPDATE, DELETE ON %s FROM careflow_app, careflow_readonly/);
  });

  it("opens a policy to everyone only for the directory, or only to the owner", () => {
    // `USING (true)` is the shape that quietly undoes a policy. Every one of
    // them must be either scoped `TO careflow_owner` (§7.5) or one of the
    // three directory tables plan §5.2 declares readable by all.
    // Split first, then look inside each statement — a regex spanning from
    // one CREATE POLICY to a `USING (true)` will happily cross into the next
    // statement and report the wrong policy.
    const statements = SQL.split(/\bCREATE POLICY\b/).slice(1).map((s) => s.split(";")[0]);
    const permissive = statements.filter((s) => /USING \(true\)/.test(s));
    assert.ok(permissive.length > 0, "expected the directory and owner policies to be found");
    for (const statement of permissive) {
      const head = statement.match(/^\s*(\S+) ON (\S+)/);
      assert.ok(head, `unparseable policy statement: ${statement.slice(0, 60)}`);
      const [, name, table] = head;
      const ownerScoped = statement.includes("TO careflow_owner");
      const directory = ["departments", "doctors", "staff"].includes(table);
      assert.ok(ownerScoped || directory, `policy ${name} on ${table} is open to every role`);
    }
  });
});

describe("can()", () => {
  it("treats a stronger grant as satisfying a weaker requirement", () => {
    const superAdmin = sessionFor("Super Admin");
    for (const area of AREAS) {
      for (const level of LEVELS) {
        assert.ok(can(superAdmin, area, level), `Super Admin should satisfy ${area}:${level}`);
      }
    }
  });

  it("agrees with the matrix for every role, area and level", () => {
    for (const role of ROLES) {
      const session = sessionFor(role);
      for (const area of AREAS) {
        const granted = ROLE_MATRIX[role][area];
        for (const level of LEVELS) {
          assert.equal(
            can(session, area, level),
            LEVELS.indexOf(granted) >= LEVELS.indexOf(level),
            `${role} / ${area} / ${level}`,
          );
        }
      }
    }
  });

  it("holds `none` for everyone, since none is what an ungranted area is", () => {
    assert.ok(can(sessionFor("Nurse"), "settings", "none"));
  });
});

describe("assert()", () => {
  it("passes silently when the level is held", () => {
    assertLevel(sessionFor("Nurse"), "patients", "edit");
  });

  it("throws ForbiddenError carrying the area, level and role", () => {
    try {
      assertLevel(sessionFor("Nurse"), "settings", "view");
      assert.fail("expected ForbiddenError");
    } catch (error) {
      assert.ok(error instanceof ForbiddenError);
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.role, "Nurse");
      assert.equal(error.area, "settings");
      assert.equal(error.level, "view");
    }
  });

  it("does not name the caller's role in the message shown to them", () => {
    try {
      assertLevel(sessionFor("Marketing"), "settings", "view");
      assert.fail("expected ForbiddenError");
    } catch (error) {
      assert.ok(error instanceof ForbiddenError);
      assert.doesNotMatch(error.message, /Marketing|full|edit|view/);
    }
  });
});

describe("reveal (plan §2.1, §8)", () => {
  it("is refused for Marketing with REVEAL_NOT_PERMITTED", () => {
    try {
      assertHolds(sessionFor("Marketing"), "reveal");
      assert.fail("expected ForbiddenError");
    } catch (error) {
      assert.ok(error instanceof ForbiddenError);
      assert.equal(error.code, "REVEAL_NOT_PERMITTED");
    }
  });

  it("is refused for Billing with REVEAL_NOT_PERMITTED", () => {
    try {
      assertHolds(sessionFor("Billing"), "reveal");
      assert.fail("expected ForbiddenError");
    } catch (error) {
      assert.ok(error instanceof ForbiddenError);
      assert.equal(error.code, "REVEAL_NOT_PERMITTED");
    }
  });

  it("is permitted for Receptionist", () => {
    assert.ok(holds(sessionFor("Receptionist"), "reveal"));
    assertHolds(sessionFor("Receptionist"), "reveal");
  });

  it("is refused while impersonating, whatever the impersonated role holds (plan §7)", () => {
    const impersonated = authzSession({
      staffId: "staff-1",
      role: "Super Admin",
      departmentId: null,
      impersonated: true,
    });
    assert.equal(holds(impersonated, "reveal"), false);
    assert.throws(() => assertHolds(impersonated, "reveal"), ForbiddenError);
    // Everything else about the impersonated role still applies — the point
    // of the feature is to see what they see.
    assert.ok(can(impersonated, "settings", "full"));
    assert.ok(holds(impersonated, "audit:read"));
  });
});

describe("export (plan §2.2, §8)", () => {
  it("needs view on the area as well as the capability", () => {
    // Manager holds `export` and `settings: none`.
    assert.ok(holds(sessionFor("Manager"), "export"));
    assert.equal(canExport(sessionFor("Manager"), "settings"), false);
    assert.ok(canExport(sessionFor("Manager"), "patients"));
  });

  it("needs the capability as well as view on the area", () => {
    // Receptionist holds `patients: view` but no `export`.
    assert.ok(can(sessionFor("Receptionist"), "patients", "view"));
    assert.equal(canExport(sessionFor("Receptionist"), "patients"), false);
  });

  it("refuses contact columns without reveal", () => {
    // No role holds `export` without `reveal`, so this is checked through a
    // hand-built session rather than a real one — the rule has to hold on
    // its own, not by accident of who currently holds what.
    const exportOnly = authzSession({
      staffId: "staff-1",
      role: "Manager",
      departmentId: "dept-1",
      impersonated: true, // suppresses reveal, keeps export
    });
    assert.ok(canExport(exportOnly, "patients"));
    assert.equal(canExport(exportOnly, "patients", { contactColumns: true }), false);
    assert.throws(
      () => assertExport(exportOnly, "patients", { contactColumns: true }),
      (error: unknown) =>
        error instanceof ForbiddenError && error.code === "REVEAL_NOT_PERMITTED",
    );
  });
});

describe("authzSession()", () => {
  it("rejects a role the matrix has never heard of", () => {
    assert.throws(
      () => authzSession({ staffId: "s", role: "Administrator", departmentId: null }),
      UnknownRoleError,
    );
  });

  it("reports department scope per plan §4", () => {
    for (const role of ROLES) {
      assert.equal(
        isDepartmentScoped(sessionFor(role)),
        DEPARTMENT_SCOPE[role] === "own-department",
        role,
      );
    }
  });
});

describe("permissionSet() — what /me returns", () => {
  it("carries every area and the held capabilities", () => {
    const set = permissionSet(sessionFor("Manager"));
    assert.equal(set.role, "Manager");
    assert.equal(set.departmentScoped, true);
    assert.deepEqual(sorted(Object.keys(set.areas)), sorted(AREAS));
    assert.deepEqual(sorted(set.capabilities), ["export", "reveal"]);
  });

  it("does not advertise a reveal that assertHolds would refuse", () => {
    const impersonated = authzSession({
      staffId: "staff-1",
      role: "Hospital Admin",
      departmentId: null,
      impersonated: true,
    });
    const set = permissionSet(impersonated);
    assert.equal(set.impersonated, true);
    assert.ok(!set.capabilities.includes("reveal"));
    assert.ok(set.capabilities.includes("audit:read"));
  });
});
