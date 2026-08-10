/**
 * Better Auth's own tables (user, session, account, verification), plus
 * auth_attempts and invitations, belong to Phase 02 — see
 * plan/02-authentication.md. Declared here as a placeholder only so the
 * directory listed in plan/01-foundation.md §2 exists ahead of that phase;
 * Phase 01 does not create or migrate anything from this file.
 *
 * Kept separate from lib/server/db/schema/people.ts by design (audit risk
 * R8): `staff.user_id` will reference this module's `user` table once it
 * exists, but auth owns its own schema rather than the two being merged.
 */
export {};
