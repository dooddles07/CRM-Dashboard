-- docs/DATABASE.md §2.7. plan/02-authentication.md §5 requires "every lock
-- writes an audit entry", including locks against an email that never
-- resolved to a real `staff` row (a plausible reconnaissance step a
-- hospital's security posture should have visibility into) -- but
-- audit_log.actor_id was NOT NULL REFERENCES staff(id), with nothing to
-- reference in that case. Loosening it is additive and safe: every existing
-- row already satisfies NOT NULL, so this can't fail against live data.
--
-- Requires drizzle/manual/0002_audit_log.sql (audit_log must already
-- exist). Run as careflow_owner, any time after step 3 in
-- drizzle/manual/README.md's table -- no ordering dependency on 0003-0005.

ALTER TABLE audit_log ALTER COLUMN actor_id DROP NOT NULL;
