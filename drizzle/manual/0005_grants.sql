-- Retroactive grant for every table that already existed before
-- 0001_extensions_and_roles.sql's ALTER DEFAULT PRIVILEGES started
-- covering new ones automatically: the 32 tables from the generated
-- migration plus audit_log (0002), which needs the narrower grant below
-- instead of the blanket one. Run this last, as careflow_owner, after
-- 0002-0004.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO careflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO careflow_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO careflow_readonly;

-- audit_log is append-only. No application role holds UPDATE or DELETE —
-- narrow what the blanket grant above just gave careflow_app.
REVOKE UPDATE, DELETE ON audit_log FROM careflow_app;
GRANT  INSERT, SELECT  ON audit_log TO   careflow_app;
