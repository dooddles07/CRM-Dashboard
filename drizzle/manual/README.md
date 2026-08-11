# Manual migrations

Everything here is SQL Drizzle's schema DSL cannot express (plan/01-foundation.md §5):
exclusion constraints, table partitioning, revoked grants, roles, extensions.
Applied with `psql` (or any migration runner that just executes SQL in order) against
`DATABASE_URL_UNPOOLED`, interleaved with the generated migrations in `drizzle/` by number:

| Order | File | Requires | Run as | Notes |
|---|---|---|---|---|
| 1 | `0001_extensions_and_roles.sql` | Nothing — run first, once per database | Neon-provisioned default role | Creates the three roles, three extensions, hands schema ownership to `careflow_owner`, and sets `ALTER DEFAULT PRIVILEGES` so every table created from here on auto-grants to `careflow_app`/`careflow_readonly`. |
| 2 | *(generated)* `drizzle/0000_*.sql` | Step 1 | `careflow_owner` | `npm run db:generate` output. Creates every table except `audit_log`. |
| 3 | `0002_audit_log.sql` | Step 2 (`staff` must exist) | `careflow_owner` | `audit_log` is never declared inside `lib/server/db/schema/` (its Drizzle definition, for typed queries only, lives at `lib/server/db/audit-log.ts` instead), because Postgres cannot `ALTER TABLE ... PARTITION BY` after the fact — it has to be declared partitioned at `CREATE TABLE` time, and `drizzle-kit generate` has no per-table exclusion (`tablesFilter` only affects `db push`). |
| 4 | `0003_no_double_booking.sql` | Step 2 (`appointments` must exist) | `careflow_owner` | The GiST exclusion constraint. |
| 5 | `0004_follow_ups_view.sql` | Step 2 (`follow_ups` must exist) | `careflow_owner` | Derives `status` so it can never go stale. |
| 6 | `0005_grants.sql` | Steps 2-4 done | `careflow_owner` | Retroactive grant for tables that existed before step 1's `ALTER DEFAULT PRIVILEGES` took effect. Must run last — its blanket grant would otherwise re-grant UPDATE/DELETE on `audit_log`. |
| 7 | `0006_audit_log_actor_nullable.sql` | Step 3 (`audit_log` must exist) | `careflow_owner` | Drops `actor_id`'s `NOT NULL` (plan/02-authentication.md §5): a lockout audit entry for an email that never resolved to a `staff` row still needs a row to live in. No ordering dependency on 0003-0005; listed last only because it was added last. |
| 8 | `0007_row_level_security.sql` | Steps 2-6, and `npm run db:seed` is easier before it than after | `careflow_owner` | plan/03-authorisation.md §5-§6. Row-level security on every patient-scoped table, the `app_*()` session-context accessors `withSession()` feeds, the two `staff` CHECK constraints, and the audit-log grants — including on `audit_log`'s **partitions**, which step 6 missed. |
| 9 | `0008_impersonation_audit.sql` | Step 3 (`audit_log` must exist) | `careflow_owner` | plan/03-authorisation.md §7. Adds the two `impersonation_*` values to the `audit_action` enum and the `impersonated_by` column that records who was really at the keyboard. No ordering dependency on `0007`. |

Re-run `0001`, `0005`, `0006`, `0007`, and `0008` are safe (idempotent — `0006`'s `DROP NOT NULL`
is a no-op if the column is already nullable, every statement in `0007` is `CREATE OR REPLACE`,
`DROP ... IF EXISTS` + `CREATE`, or an `ALTER` that no-ops when already applied, and `0008` uses
`IF NOT EXISTS` throughout; re-running `0007` is the intended way to apply a policy change).
`0002`-`0004` are not — each is a one-time `CREATE`.

`careflow_app` must never be granted `BYPASSRLS`. It is easy to grant by accident while
debugging Phase 03's row-level security policies; don't.

## Which connection string, in practice

The project's `DATABASE_URL` / `DATABASE_URL_UNPOOLED` (what `vercel env pull` gives you) are
**`careflow_app`** credentials — that's what the running app uses. Migrations need
`careflow_owner`, which only has `CREATE` rights, so **`npm run db:generate` / `npm run db:migrate`
need `DATABASE_URL_UNPOOLED` overridden to `CAREFLOW_OWNER_URL_UNPOOLED`** for that one command —
both are Vercel project env vars (`vercel env pull` gets both names). `CAREFLOW_READONLY_URL`
exists for analytics / ad-hoc query tools.

**`npm run db:seed` also needs `careflow_owner` as of `0007`.** It reads
`CAREFLOW_OWNER_URL_UNPOOLED` first and falls back to `DATABASE_URL_UNPOOLED`. Seeding as
`careflow_app` against a database with `0007` applied fails on the first `INSERT` with a
row-level-security violation, which is the correct outcome — the seed writes per-staff rows for
twelve different people and no one session context is all twelve. `0007` §7.5 explains why the
owner gets a declared policy rather than `BYPASSRLS`.

The policy test suite (`npm run test:policies`) is the mirror image: it must connect as
**`careflow_app`** and refuses to run as anyone else. A run as the owner would pass every
assertion regardless of whether the policies work.

`drizzle-kit migrate` itself was observed to hang indefinitely against a real Neon database in
this environment (sandboxed Node on Windows) — no error, no timeout, just stuck. The generated
SQL applied instantly through a plain `@neondatabase/serverless` `Client.query()` call instead, so
if `db:migrate` hangs, that's the workaround: run the migration file's SQL directly, then insert a
matching row into `drizzle."__drizzle_migrations"` (columns: `hash` = sha256 of the migration
file's full text, `created_at` = that entry's `when` from `drizzle/meta/_journal.json`) so the
next `drizzle-kit` invocation doesn't try to redo it.
