-- plan/01-foundation.md §1.2, §1.3. Run once, as the Neon-provisioned
-- superuser, before any generated migration. Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid, pgp_sym_encrypt
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram search on names
CREATE EXTENSION IF NOT EXISTS btree_gist; -- the appointment exclusion constraint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careflow_owner') THEN
    CREATE ROLE careflow_owner LOGIN PASSWORD :'careflow_owner_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careflow_app') THEN
    CREATE ROLE careflow_app LOGIN PASSWORD :'careflow_app_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careflow_readonly') THEN
    CREATE ROLE careflow_readonly LOGIN PASSWORD :'careflow_readonly_password';
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO careflow_app, careflow_readonly;

-- ALTER ... OWNER TO requires the connecting role to already hold
-- membership in the target role — Neon's provisioned default role isn't
-- automatically a member of a role it just created, so this has to be
-- explicit. Idempotent (GRANT of an already-held role is a no-op).
GRANT careflow_owner TO CURRENT_USER;

-- careflow_owner runs every migration (generated and manual), so it needs
-- to actually be able to create things. Handing it schema ownership
-- outright is simpler and more durable than a pile of individual GRANTs
-- that drift every time a new object type shows up.
ALTER SCHEMA public OWNER TO careflow_owner;
GRANT ALL ON SCHEMA public TO careflow_owner;

-- Schema ownership alone isn't database-level CREATE: drizzle-orm's own
-- migration bookkeeping (the "drizzle" schema holding
-- __drizzle_migrations) needs a *new* schema created, which requires
-- CREATE on the database itself, not just on "public". GRANT ... ON
-- DATABASE takes a literal identifier, not an expression, hence the
-- dynamic EXECUTE — the database name differs per Neon branch.
DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO careflow_owner', current_database());
END
$$;

-- Every table careflow_owner creates from here on automatically grants
-- CRUD to careflow_app and SELECT to careflow_readonly — otherwise every
-- future migration would need its own manual grant statement appended.
-- Tables that already exist at the time this runs are unaffected; see
-- drizzle/manual/0005_grants.sql for the retroactive, one-time grant on
-- what the generated migration and 0002-0004 create.
ALTER DEFAULT PRIVILEGES FOR ROLE careflow_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO careflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE careflow_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO careflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE careflow_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO careflow_readonly;

-- careflow_app must never hold BYPASSRLS — Phase 03's row-level security
-- depends on it not having that privilege. Easy to grant by accident while
-- debugging; don't.
