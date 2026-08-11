/**
 * task-3-brief.md §1/§2: "Validate `--role` against the actual set of role
 * strings this codebase uses today — the nine-role matrix isn't code yet
 * (that's Phase 03), so don't invent a different taxonomy." Derived via
 * `grep -oE 'role: "[^"]+"' lib/data/people.ts | sort -u`, which returns
 * exactly these 8 strings across the 12 seeded staff fixtures. `staff.role`
 * (lib/server/db/schema/people.ts) stays TEXT, not an enum — Phase 03
 * decides the real shape — so this is "is this a known role string today",
 * not permission-matrix enforcement (explicitly out of scope, brief's
 * "Out of scope" section).
 *
 * Re-derive this list (and re-run the grep above) if `lib/data/people.ts`'s
 * fixtures change; nothing keeps this array in sync automatically the way
 * `scripts/gen-enums.ts` keeps `lib/server/db/schema/enums.ts` in sync with
 * `lib/types.ts` (`npm run gen:enums:check` fails CI on drift) — `staff.role`
 * is plain TEXT, not a generated pgEnum, so there's no equivalent codegen
 * for this list to drift out of sync with.
 */
export const KNOWN_STAFF_ROLES = [
  "Billing",
  "Hospital Admin",
  "Manager",
  "Marketing",
  "Nurse",
  "Patient Relations",
  "Receptionist",
  "Super Admin",
] as const;

export type KnownStaffRole = (typeof KNOWN_STAFF_ROLES)[number];

export function isKnownStaffRole(role: string): role is KnownStaffRole {
  return (KNOWN_STAFF_ROLES as readonly string[]).includes(role);
}
