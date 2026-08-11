/**
 * Phase 02 shipped this file as a hand-maintained list of the 8 role strings
 * that appeared in `lib/data/people.ts`'s staff fixtures, with a header
 * saying the real shape was Phase 03's decision and warning that "nothing
 * keeps this array in sync automatically". Phase 03 made that decision:
 * `lib/server/authz/matrix.ts` is the source of truth for the nine roles, so
 * this module is now a re-export rather than a second list to keep in sync.
 *
 * The set gains "Doctor", which the fixtures never used (doctors live in the
 * `doctors` table, not `staff`) but which the matrix has always named as a
 * role — so `npm run provision --role Doctor` and a Doctor invitation are
 * both accepted now, and were not before. That is the intended taxonomy, not
 * a widening: plan/03-authorisation.md §1 lists nine roles and enforcement
 * covers all nine.
 *
 * The two names are kept (rather than rewriting both call sites to import
 * `isRole`) because "is this a role a person may be *provisioned into*" is a
 * question that could legitimately narrow later — an invitation flow might
 * one day refuse to mint a second Super Admin over the wire, say — and that
 * would be a change to this module, not to the matrix.
 */
import { ROLES, isRole, type Role } from "@/lib/server/authz/matrix";

export const KNOWN_STAFF_ROLES = ROLES;

export type KnownStaffRole = Role;

export function isKnownStaffRole(role: string): role is KnownStaffRole {
  return isRole(role);
}
