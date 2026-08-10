-- plan/01-foundation.md §4.3 / docs/DATABASE.md §2.4. Requires
-- `appointments` (generated migration) and the btree_gist extension
-- (0001_extensions_and_roles.sql).
--
-- Two receptionists booking the same slot is a race the database wins and
-- the UI cannot. The violation surfaces as SQLSTATE 23P01; the service
-- layer (Phase 04) maps it to HTTP 409 with code: "SLOT_CONFLICT", never
-- to a 500.
--
-- Two deviations from the plan's literal SQL, both found by actually
-- running this against Neon — neither is visible from reading the SQL,
-- only from Postgres's own catalog:
--
-- 1. `(duration_minutes || ' minutes')::interval` builds the interval by
--    parsing text; `interval_in` is STABLE, not IMMUTABLE. Multiplying a
--    literal `interval '1 minute'` by the smallint column avoids text
--    parsing and is immutable — but didn't fix the error, because:
-- 2. `timestamptz + interval` itself (`timestamptz_pl_interval`) is also
--    STABLE, not IMMUTABLE — general interval arithmetic on a timestamptz
--    can depend on the session TimeZone setting. Converting to a
--    `timestamp` in a *fixed, literal* zone first (`AT TIME ZONE 'UTC'` —
--    not the session zone) sidesteps that: `timestamp + interval`
--    (`timestamp_pl_interval`) is genuinely immutable, and a fixed-literal
--    `AT TIME ZONE 'UTC'` conversion is too. A `tsrange` compares the same
--    way a `tstzrange` would; only the storage representation differs.
--
-- A GiST exclusion index requires every expression in it to be immutable,
-- so both had to be fixed — either one alone still fails with "functions
-- in index expression must be marked IMMUTABLE".

ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    doctor_id WITH =,
    tsrange(
      (starts_at AT TIME ZONE 'UTC'),
      (starts_at AT TIME ZONE 'UTC') + duration_minutes * interval '1 minute'
    ) WITH &&
  ) WHERE (status NOT IN ('cancelled','no_show'));
