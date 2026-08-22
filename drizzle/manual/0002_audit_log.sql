-- docs/DATABASE.md §2.7, verbatim. Never declared inside
-- lib/server/db/schema/ (drizzle-kit generate has no per-table exclusion,
-- so keeping it out of that directory entirely is what keeps it out of
-- the generated migration) because Postgres cannot ALTER an existing table
-- to add PARTITION BY — it must be declared partitioned at CREATE TABLE
-- time. Requires `staff` to already exist (generated migration, step 2 in
-- drizzle/manual/README.md). Run as careflow_owner.

CREATE TABLE audit_log (
  id             BIGSERIAL,
  actor_id       UUID NOT NULL REFERENCES staff(id),
  actor_name     TEXT NOT NULL,
  action         audit_action NOT NULL,
  resource_type  TEXT NOT NULL,
  resource_id    TEXT NOT NULL,
  field          TEXT,
  previous_value TEXT,
  new_value      TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address     INET,
  user_agent     TEXT,
  -- Better Auth's session.id (its default generateId), not a UUID.
  session_id     TEXT,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- BIGSERIAL's sequence must be shared across all partitions, which
-- PARTITION BY RANGE already guarantees since the sequence lives on the
-- parent. The primary key includes occurred_at because Postgres requires
-- the partition key to be part of every unique constraint on a
-- partitioned table.

CREATE TABLE audit_log_2026q3 PARTITION OF audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');

CREATE TABLE audit_log_2026q4 PARTITION OF audit_log
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id, occurred_at DESC);
CREATE INDEX idx_audit_actor    ON audit_log(actor_id, occurred_at DESC);

-- Append-only: no application role holds UPDATE or DELETE on this table.
-- The grant lives in drizzle/manual/0005_grants.sql, not here — that file
-- runs last and would otherwise clobber a revoke made this early with its
-- blanket "ALL TABLES" grant to careflow_app.
