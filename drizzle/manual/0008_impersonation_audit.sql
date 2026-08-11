-- plan/03-authorisation.md §7. What impersonation needs from the database.
--
-- Run as careflow_owner, after 0007. Idempotent.
--
-- Separate from 0007 because it is a different subject: 0007 is row-level
-- security, this is the audit trail's ability to say who was really acting.
-- Also because ALTER TYPE ... ADD VALUE has a transaction rule of its own
-- (see below) and mixing it into the policy migration would constrain how
-- that one can be run.

-- ---------------------------------------------------------------------------
-- 1. The two new audit actions
-- ---------------------------------------------------------------------------
-- Generated into lib/server/db/schema/enums.ts from the AuditAction union in
-- lib/types.ts (`npm run gen:enums`), which is why the TypeScript side needs
-- no separate edit here — but Postgres enums only grow through ALTER TYPE,
-- and drizzle-kit does not emit that, so this is hand-written.
--
-- IF NOT EXISTS makes re-running safe. Postgres 12+ permits ADD VALUE inside
-- a transaction block; the added value just cannot be *used* until that
-- transaction commits. Nothing below uses them, so this file can be applied
-- as one unit.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'impersonation_started';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'impersonation_ended';


-- ---------------------------------------------------------------------------
-- 2. The true actor
-- ---------------------------------------------------------------------------
-- plan §7: impersonation "stamps every audit entry made during the session
-- with the true actor as well as the impersonated one".
--
-- `actor_id` stays the impersonated staff member — that is who the system
-- believed was acting, and rewriting it would make the entry disagree with
-- every other record of the same operation. `impersonated_by` is the Super
-- Admin who was really at the keyboard. NULL on every ordinary entry, which
-- is also what makes "show me everything done under impersonation" a single
-- indexed predicate rather than a join against the session table.
--
-- ADD COLUMN on a partitioned table propagates to existing partitions and to
-- any created later, so this needs no per-partition loop the way 0007's
-- grants did.

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS impersonated_by UUID REFERENCES staff(id);

-- Partial: the column is NULL for all but a vanishing fraction of entries,
-- and the only query that wants it wants exactly the non-NULL ones.
CREATE INDEX IF NOT EXISTS idx_audit_impersonated
  ON audit_log (impersonated_by, occurred_at DESC)
  WHERE impersonated_by IS NOT NULL;
