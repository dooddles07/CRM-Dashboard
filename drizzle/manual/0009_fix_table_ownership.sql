-- Repairs split ownership in `public`. Run as the **Neon-provisioned role**
-- (neondb_owner), not as careflow_owner — the whole point is that
-- careflow_owner does not own these objects yet and therefore cannot grant
-- on them.
--
-- Why this is needed: 0001_extensions_and_roles.sql hands schema ownership
-- to careflow_owner and sets ALTER DEFAULT PRIVILEGES so that everything
-- *careflow_owner* creates auto-grants to careflow_app. Phase 02's
-- migrations were applied through the Neon-provisioned role instead, so
-- nine tables — user, session, account, verification, two_factor,
-- auth_attempts, auth_timing_padding, invitations, password_reset_tokens —
-- ended up owned by neondb_owner with no grant to careflow_app at all.
--
-- The symptom is not subtle once the application stops connecting as
-- neondb_owner: sign-in fails outright, because resolving a session reads
-- `session` and `user`. It was invisible before only because the
-- application was connecting as the owner of those tables.
--
-- Re-running 0005_grants.sql as careflow_owner fails with
-- "permission denied for table verification" until this has run, since
-- GRANT requires ownership.
--
-- Idempotent: a table already owned by careflow_owner is skipped.

DO $$
DECLARE obj record;
BEGIN
  FOR obj IN
    SELECT c.oid::regclass AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
      AND pg_get_userbyid(c.relowner) <> 'careflow_owner'
      -- A sequence created by SERIAL or GENERATED ... AS IDENTITY is owned
      -- by its table's column and cannot be reassigned on its own:
      -- "cannot change owner of sequence ... it is owned by a table". It
      -- follows the table's ownership automatically, so skipping it here is
      -- correct rather than a compromise.
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid
          AND d.deptype IN ('a', 'i')
      )
  LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO careflow_owner', obj.name);
  END LOOP;
END
$$;

-- Partitions are reassigned by the loop above as ordinary relations ('r'),
-- and standalone sequences by the same ALTER TABLE form, which Postgres
-- accepts for sequences.
--
-- After this, run 0005_grants.sql as careflow_owner to give careflow_app
-- the CRUD it now lacks on those nine tables, then 0007 and 0008.
