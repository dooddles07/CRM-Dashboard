import {
  AREAS,
  type Area,
  type Capability,
  DEPARTMENT_SCOPE,
  LEVELS,
  type Level,
  ROLE_CAPABILITIES,
  ROLE_MATRIX,
  type Role,
  isRole,
} from "./matrix";

/**
 * plan/03-authorisation.md §3. The decision functions over ./matrix.ts.
 *
 * Three rules from plan §3 shape everything here:
 *
 *  1. **Every service method takes `session` as its first argument,
 *     non-optional.** That is a Phase 04 convention this module cannot
 *     enforce, but it is why every function below leads with `session`:
 *     "forgetting the check is possible; forgetting the argument is a
 *     compile error, and the argument is useless unless checked, so review
 *     has one thing to look for."
 *  2. **`assert` throws a typed `ForbiddenError`** carrying area, level, and
 *     role, so Phase 05 can map it to the documented error envelope
 *     (docs/API.md "Error response") rather than a generic 403, and Phase 04
 *     can write a useful audit entry from it.
 *  3. **Denials are logged at `warn`** — see `logDenial` for why only the
 *     `assert*` family logs and the `can`/`holds` predicates do not.
 *
 * This module is the application half of enforcement. The other half is
 * Postgres row-level security (drizzle/manual/0007_rls.sql), reached through
 * `withSession` in lib/server/db/session.ts. Neither is a substitute for the
 * other: this one answers "may this role perform this kind of operation at
 * all", RLS answers "on which rows" — docs/SECURITY.md §3.2's "enforced
 * twice".
 */

export type { Area, Capability, Level, Role } from "./matrix";

/**
 * What every decision below is made about. Deliberately narrower than
 * `AuthedSession` (lib/server/auth/session.ts): four fields, no Better Auth
 * types, no `staff` row. That keeps this module callable from the policy
 * tests and from `withSession` without dragging a request context along, and
 * makes the inputs to an authorisation decision small enough to enumerate.
 *
 * Build one with `authzSession()` rather than by hand — `role` is a `Role`,
 * but `staff.role` is TEXT in the database, and the narrowing has to happen
 * somewhere that fails loudly.
 */
export interface AuthzSession {
  /** `staff.id` — the acting person, not `user.id`. */
  staffId: string;
  role: Role;
  /** `null` for roles that sit outside any one department (e.g. the seeded Hospital Admin). */
  departmentId: string | null;
  /**
   * True while a Super Admin is acting as someone else through Better
   * Auth's admin plugin (`session.impersonated_by` is set). plan §7: an
   * impersonated session cannot reveal PII "regardless of the impersonated
   * role" — `holds` enforces exactly that and nothing else, so an
   * impersonator can still see the screens the impersonated role sees,
   * which is the point of the feature.
   */
  impersonated: boolean;
}

/** Codes the API contract already documents (docs/API.md "Error response"). */
export type ForbiddenCode =
  | "FORBIDDEN"
  | "REVEAL_NOT_PERMITTED"
  | "EXPORT_NOT_PERMITTED"
  | "AUDIT_ACCESS_DENIED";

/**
 * plan §3: "`assert` throws a typed `ForbiddenError`. It carries the area,
 * level, and role, which becomes the `REVEAL_NOT_PERMITTED`-style error
 * envelope in Phase 05 and a useful audit entry rather than a generic 403."
 *
 * `message` is written for the person who will read it — docs/API.md: "the
 * UI shows it directly" — so it never names the caller's own role back at
 * them, and never says what would have been required, which is a small
 * enumeration oracle. The structured fields carry that detail instead, for
 * the log and the audit entry.
 *
 * Note this is a *403* error, and 403 is only correct for "authenticated,
 * not permitted". Out-of-scope rows are a different answer: plan §8 and
 * plan/05-http-api.md §3.2 both require 404 there, "out of scope is
 * indistinguishable from not existing", and that case never reaches this
 * class — RLS returns zero rows and the service reports not-found.
 */
export class ForbiddenError extends Error {
  readonly name = "ForbiddenError";
  readonly code: ForbiddenCode;
  readonly role: Role;
  readonly area?: Area;
  readonly level?: Level;
  readonly capability?: Capability;

  constructor(
    message: string,
    detail: {
      code?: ForbiddenCode;
      role: Role;
      area?: Area;
      level?: Level;
      capability?: Capability;
    },
  ) {
    super(message);
    this.code = detail.code ?? "FORBIDDEN";
    this.role = detail.role;
    this.area = detail.area;
    this.level = detail.level;
    this.capability = detail.capability;
  }
}

/** Thrown when a `staff.role` string is not one of the nine. See `authzSession`. */
export class UnknownRoleError extends Error {
  readonly name = "UnknownRoleError";
  constructor(readonly value: string) {
    super(
      `Staff role ${JSON.stringify(value)} is not one of the nine roles in lib/server/authz/matrix.ts.`,
    );
  }
}

/**
 * The only supported way to build an `AuthzSession`, because it is the one
 * place `staff.role`'s TEXT widens into the `Role` union.
 *
 * Throws rather than returning `null` or falling back to a least-privilege
 * role. Both alternatives were considered and both are worse here: they turn
 * a misconfigured account into plan §5.3's empty-set failure mode — "a wrong
 * policy does not error, it returns zero rows, and a screen showing an empty
 * state looks like a data problem rather than a permissions bug". A thrown
 * error at session resolution names the cause on the first request instead.
 *
 * The database will not let this happen in the first place: `staff_role_known`
 * (drizzle/manual/0007_rls.sql §1) constrains the column to the same nine
 * strings. This check exists for the gap between a row written before that
 * constraint landed and one written after, and to make the type narrowing
 * honest rather than a cast.
 */
export function authzSession(input: {
  staffId: string;
  role: string;
  departmentId: string | null;
  impersonated?: boolean;
}): AuthzSession {
  if (!isRole(input.role)) throw new UnknownRoleError(input.role);
  return {
    staffId: input.staffId,
    role: input.role,
    departmentId: input.departmentId,
    impersonated: input.impersonated ?? false,
  };
}

/**
 * plan §1: "`full` ⊃ `edit` ⊃ `view` ⊃ `none`" — a grant satisfies every
 * weaker requirement, so this is an index comparison over `LEVELS`, whose
 * order is therefore load-bearing.
 */
export function can(session: AuthzSession, area: Area, level: Level): boolean {
  const granted = ROLE_MATRIX[session.role][area];
  return LEVELS.indexOf(granted) >= LEVELS.indexOf(level);
}

/** The level this role holds on an area, for display and for `/me`. */
export function levelFor(session: AuthzSession, area: Area): Level {
  return ROLE_MATRIX[session.role][area];
}

/**
 * plan §2's discrete capabilities, plus plan §7's impersonation carve-out:
 * `reveal` is false while impersonating whatever the impersonated role
 * holds. Without that, "act as" is an unmasking tool that attributes the
 * unmasking to somebody else, which is the shape of hole plan §7 exists to
 * close.
 *
 * `export` is *not* carved out the same way, and that is deliberate rather
 * than an omission: plan §2.2 makes an export of contact-detail columns
 * require `reveal` as well, so `assertExport({ contactColumns: true })`
 * already fails for an impersonated session by way of this same check. An
 * export of non-contact columns is not a reveal and needs no carve-out.
 */
export function holds(session: AuthzSession, capability: Capability): boolean {
  if (capability === "reveal" && session.impersonated) return false;
  return ROLE_CAPABILITIES[session.role].includes(capability);
}

/**
 * plan §2.2: an export "requires `view` on the area **and** the `export`
 * capability". Both, not either — `export` alone would let Manager export an
 * area it cannot read.
 *
 * The other half of §2.2 — "each exported row writes to the same reveal
 * budget" — is not here. It is a transaction against the budget, not a
 * predicate, and belongs with Phase 04's reveal transaction; this function's
 * job is to stop an export that must never start.
 */
export function canExport(
  session: AuthzSession,
  area: Area,
  options: { contactColumns?: boolean } = {},
): boolean {
  if (!can(session, area, "view")) return false;
  if (!holds(session, "export")) return false;
  if (options.contactColumns && !holds(session, "reveal")) return false;
  return true;
}

/** plan §4. `true` when this role only ever sees its own department's rows. */
export function isDepartmentScoped(session: AuthzSession): boolean {
  return DEPARTMENT_SCOPE[session.role] === "own-department";
}

/**
 * plan §3: `assert(session, area, level): void  // throws Forbidden`.
 *
 * Named `assert` per the plan. Import it aliased (`import { assert as
 * assertCan }`) where node:assert is also in scope; the module is small
 * enough that the collision is a naming nuisance, not a reason to rename the
 * contract the plan specifies.
 */
export function assert(session: AuthzSession, area: Area, level: Level): void {
  if (can(session, area, level)) return;
  logDenial({ session, area, level });
  throw new ForbiddenError(`You do not have access to ${area} in this application.`, {
    role: session.role,
    area,
    level,
  });
}

const CAPABILITY_DENIAL: Record<Capability, { code: ForbiddenCode; message: string }> = {
  reveal: {
    code: "REVEAL_NOT_PERMITTED",
    message: "Your role cannot reveal contact details.",
  },
  export: {
    code: "EXPORT_NOT_PERMITTED",
    message: "Your role cannot export records.",
  },
  "audit:read": {
    code: "AUDIT_ACCESS_DENIED",
    message: "Your role cannot read the audit log.",
  },
};

/**
 * plan §8: "Marketing attempting a reveal gets `REVEAL_NOT_PERMITTED`" —
 * hence the per-capability code rather than a bare 403, mapped straight onto
 * the envelope docs/API.md already documents.
 */
export function assertHolds(session: AuthzSession, capability: Capability): void {
  if (holds(session, capability)) return;
  const denial = CAPABILITY_DENIAL[capability];
  logDenial({ session, capability });
  throw new ForbiddenError(denial.message, {
    code: denial.code,
    role: session.role,
    capability,
  });
}

/** `canExport`, as an assertion. Reports whichever of the three conditions failed. */
export function assertExport(
  session: AuthzSession,
  area: Area,
  options: { contactColumns?: boolean } = {},
): void {
  assert(session, area, "view");
  assertHolds(session, "export");
  if (options.contactColumns) assertHolds(session, "reveal");
}

/**
 * The caller's own permission set — plan §3.1: "`/me` returns the caller's
 * permission set, and the rail, command palette, and row menus filter
 * against it."
 *
 * docs/SECURITY.md §3.2, quoted by plan §3.1: *"UI hiding stays as a
 * courtesy. A hidden button is not an access control."* Everything this
 * returns is a courtesy. The server re-checks every one of these decisions
 * on the request that acts on them, and nothing that consumes this output is
 * trusted by anything that enforces.
 */
export interface PermissionSet {
  role: Role;
  departmentId: string | null;
  departmentScoped: boolean;
  impersonated: boolean;
  areas: Record<Area, Level>;
  capabilities: Capability[];
}

export function permissionSet(session: AuthzSession): PermissionSet {
  const areas = Object.fromEntries(AREAS.map((area) => [area, levelFor(session, area)])) as Record<
    Area,
    Level
  >;
  return {
    role: session.role,
    departmentId: session.departmentId,
    departmentScoped: isDepartmentScoped(session),
    impersonated: session.impersonated,
    areas,
    // Filtered through `holds`, not read from ROLE_CAPABILITIES directly, so
    // an impersonated session's set does not advertise a `reveal` that
    // `assertHolds` would refuse.
    capabilities: ROLE_CAPABILITIES[session.role].filter((capability) =>
      holds(session, capability),
    ),
  };
}

/**
 * plan §3: "Denials are logged at `warn`. A user repeatedly hitting the same
 * 403 is either a UI bug showing them a button they cannot use, or someone
 * probing. Both are worth seeing."
 *
 * Only the `assert*` family logs. `can`/`holds` deliberately do not: the rail
 * and the command palette call `can` once per nav item on every render to
 * decide what to draw, and logging those would bury the denials that are
 * actually a 403 under a continuous stream of ones that are a UI working
 * correctly. A denial is interesting when someone tried to *do* the thing.
 *
 * `console.warn` with a stable shape, not a logger: Phase 09 owns structured
 * logging and the `error_log` table, and this is the call site it will
 * replace. `staffId` identifies the actor without carrying a name or an
 * email into the log, per docs/SECURITY.md's line on what logs may hold.
 */
function logDenial(input: {
  session: AuthzSession;
  area?: Area;
  level?: Level;
  capability?: Capability;
}): void {
  console.warn(
    JSON.stringify({
      event: "authz.denied",
      staffId: input.session.staffId,
      role: input.session.role,
      impersonated: input.session.impersonated,
      ...(input.area ? { area: input.area, required: input.level } : {}),
      ...(input.capability ? { capability: input.capability } : {}),
    }),
  );
}
