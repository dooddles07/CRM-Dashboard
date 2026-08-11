/**
 * plan/03-authorisation.md §1, §2, §4. The nine-role matrix as data.
 *
 * This file is the source of truth for three separate things that used to
 * live in three places, or in no place at all:
 *
 *  1. the levels table `/admin/roles` renders (previously a local array in
 *     that page — plan §1: "The screen keeps rendering this table. It stops
 *     holding the data, and imports it from `lib/server/authz/matrix.ts`
 *     instead, so the page and the enforcement can never disagree");
 *  2. the three capabilities four levels across seven areas cannot express
 *     (plan §2);
 *  3. which roles see every department and which see only their own (plan
 *     §4), mirrored into SQL by drizzle/manual/0007_rls.sql.
 *
 * Data only — no functions, no imports, nothing server-only. `can`/`holds`/
 * `assert` live in ./policy.ts. Kept that way deliberately: the roles screen
 * is a Server Component and imports this module directly, so anything with a
 * runtime dependency (a database handle, a logger) belongs next door, not
 * here.
 *
 * Changing a cell in ROLE_MATRIX changes enforcement. The SQL policies in
 * drizzle/manual/0007_rls.sql restate DEPARTMENT_SCOPE in a language this
 * file cannot reach; lib/server/authz/matrix.test.ts asserts the two agree,
 * so a change here that isn't mirrored there fails rather than silently
 * granting a role rows it should not see.
 */

/** plan §1's seven columns. The `Area` union in plan §3, verbatim. */
export const AREAS = [
  "patients",
  "appointments",
  "pipeline",
  "billing",
  "reports",
  "settings",
  "users",
] as const;

export type Area = (typeof AREAS)[number];

/**
 * plan §1: "`full` ⊃ `edit` ⊃ `view` ⊃ `none`. `full` adds destructive
 * operations — archive, delete, bulk action — on top of `edit`." Ordered
 * weakest to strongest; ./policy.ts compares by index, so the order of this
 * array is load-bearing, not cosmetic.
 */
export const LEVELS = ["none", "view", "edit", "full"] as const;

export type Level = (typeof LEVELS)[number];

/**
 * plan §2. Discrete grants, not derived from level — each covers an
 * operation sharper than the area/level grid can express.
 */
export const CAPABILITIES = ["reveal", "export", "audit:read"] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * The nine roles. Identical to `StaffRole` in lib/types.ts, which the seed
 * fixtures and every screen already use — this is a re-declaration in
 * server-land rather than an import so that lib/server/authz has no
 * dependency on the client-side domain model, and lib/server/authz/matrix.test.ts
 * asserts the two lists stay identical.
 *
 * Note that `staff.role` is TEXT, not an enum (lib/server/db/schema/people.ts;
 * the deliberate choice is documented in scripts/gen-enums.ts's header). Phase
 * 03 was the point at which that was to be revisited — see
 * drizzle/manual/0007_rls.sql §1 for what was decided and why a CHECK
 * constraint was chosen over a pgEnum.
 */
export const ROLES = [
  "Super Admin",
  "Hospital Admin",
  "Manager",
  "Doctor",
  "Nurse",
  "Receptionist",
  "Patient Relations",
  "Marketing",
  "Billing",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * plan §1's table, transcribed verbatim. It was transcribed into the plan
 * from app/(app)/admin/roles/page.tsx precisely so that it "becomes the
 * source of truth and must not be retyped from memory" — this is the third
 * and final copy, and the other two are now gone: the page imports this, and
 * the plan is a description of it.
 *
 * Row order matches plan §1 and the order the screen renders.
 */
export const ROLE_MATRIX: Record<Role, Record<Area, Level>> = {
  "Super Admin": {
    patients: "full",
    appointments: "full",
    pipeline: "full",
    billing: "full",
    reports: "full",
    settings: "full",
    users: "full",
  },
  "Hospital Admin": {
    patients: "full",
    appointments: "full",
    pipeline: "full",
    billing: "edit",
    reports: "full",
    settings: "edit",
    users: "edit",
  },
  Manager: {
    patients: "edit",
    appointments: "edit",
    pipeline: "full",
    billing: "view",
    reports: "full",
    settings: "none",
    users: "view",
  },
  Doctor: {
    patients: "edit",
    appointments: "edit",
    pipeline: "none",
    billing: "none",
    reports: "view",
    settings: "none",
    users: "none",
  },
  Nurse: {
    patients: "edit",
    appointments: "view",
    pipeline: "none",
    billing: "none",
    reports: "none",
    settings: "none",
    users: "none",
  },
  Receptionist: {
    patients: "view",
    appointments: "full",
    pipeline: "view",
    billing: "view",
    reports: "none",
    settings: "none",
    users: "none",
  },
  "Patient Relations": {
    patients: "edit",
    appointments: "edit",
    pipeline: "full",
    billing: "none",
    reports: "view",
    settings: "none",
    users: "none",
  },
  Marketing: {
    patients: "view",
    appointments: "none",
    pipeline: "full",
    billing: "none",
    reports: "view",
    settings: "none",
    users: "none",
  },
  Billing: {
    patients: "view",
    appointments: "view",
    pipeline: "none",
    billing: "full",
    reports: "view",
    settings: "none",
    users: "none",
  },
};

/**
 * plan §2.1, §2.2, §2.3. Held capabilities per role.
 *
 * `reveal` is withheld from Marketing and Billing because both hold
 * `patients: view` for reasons that never require an individual contact
 * detail — audience aggregates and claims respectively — and letting a
 * `view` grant imply unmasking would defeat the control the product exists
 * to demonstrate.
 *
 * `export` is a bulk reveal (docs/SECURITY.md §2.3). Holding it is not
 * sufficient on its own: plan §2.2 requires `view` on the area *as well*,
 * and exporting contact-detail columns additionally requires `reveal` and
 * charges every exported row to the same budget an interactive reveal draws
 * on. `./policy.ts`'s `canExport` composes the first two; the budget is
 * Phase 04's reveal transaction.
 *
 * Nobody holds `audit:write` or `audit:delete` and neither is declared:
 * plan §2.3 — "the audit writer runs with a database grant, not a role
 * capability", and drizzle/manual/0007_rls.sql revokes the UPDATE/DELETE
 * statements outright so no capability *could* re-grant them.
 */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  "Super Admin": ["reveal", "export", "audit:read"],
  "Hospital Admin": ["reveal", "export", "audit:read"],
  Manager: ["reveal", "export"],
  Doctor: ["reveal"],
  Nurse: ["reveal"],
  Receptionist: ["reveal"],
  "Patient Relations": ["reveal", "export"],
  Marketing: [],
  Billing: [],
};

/**
 * plan §4. "The matrix says what a role may do. It does not say to whom."
 *
 * `all` sees every department's rows; `own-department` sees only rows
 * carrying the acting staff member's `department_id`. Enforced in Postgres,
 * not in a `WHERE` clause the application has to remember — see
 * drizzle/manual/0007_rls.sql, whose policies list exactly the `all` roles
 * below. The two must agree; lib/server/authz/matrix.test.ts checks that
 * they do by parsing the SQL.
 *
 * Patient Relations and Receptionist are `all` for stated reasons (the role
 * coordinates across departments; the front desk sees everyone arriving),
 * not by omission. Marketing is `all` but holds no `reveal`, so what it sees
 * across departments stays masked.
 */
export const DEPARTMENT_SCOPE: Record<Role, "all" | "own-department"> = {
  "Super Admin": "all",
  "Hospital Admin": "all",
  Manager: "own-department",
  Doctor: "own-department",
  Nurse: "own-department",
  Receptionist: "all",
  "Patient Relations": "all",
  Marketing: "all",
  Billing: "all",
};

/** The `all`-scope roles, as the SQL policies list them. */
export const UNSCOPED_ROLES: readonly Role[] = ROLES.filter(
  (role) => DEPARTMENT_SCOPE[role] === "all",
);

/**
 * Column headings for `/admin/roles`. Area keys are lower-case singulars of
 * the policy vocabulary; these are what a human reads. Kept beside the data
 * rather than in the page so a new area cannot be added without one.
 */
export const AREA_LABELS: Record<Area, string> = {
  patients: "Patients",
  appointments: "Appointments",
  pipeline: "Pipeline",
  billing: "Billing",
  reports: "Reports",
  settings: "Settings",
  users: "Users",
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
