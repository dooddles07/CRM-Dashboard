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

Re-run `0001` and `0005` are safe (idempotent / re-assert the same grants). `0002`-`0004` are not —
each is a one-time `CREATE`.

`careflow_app` must never be granted `BYPASSRLS`. It is easy to grant by accident while
debugging Phase 03's row-level security policies; don't.

## Which connection string, in practice

The project's `DATABASE_URL` / `DATABASE_URL_UNPOOLED` (what `vercel env pull` gives you) are
**`careflow_app`** credentials — that's what the running app and `scripts/seed.ts` use. Migrations
need `careflow_owner`, which only has `CREATE` rights, so **`npm run db:generate` /
`npm run db:migrate` need `DATABASE_URL_UNPOOLED` overridden to `CAREFLOW_OWNER_URL_UNPOOLED`**
for that one command — both are Vercel project env vars (`vercel env pull` gets both names).
`CAREFLOW_READONLY_URL` exists for analytics / ad-hoc query tools.

`drizzle-kit migrate` itself was observed to hang indefinitely against a real Neon database in
this environment (sandboxed Node on Windows) — no error, no timeout, just stuck. The generated
SQL applied instantly through a plain `@neondatabase/serverless` `Client.query()` call instead, so
if `db:migrate` hangs, that's the workaround: run the migration file's SQL directly, then insert a
matching row into `drizzle."__drizzle_migrations"` (columns: `hash` = sha256 of the migration
file's full text, `created_at` = that entry's `when` from `drizzle/meta/_journal.json`) so the
next `drizzle-kit` invocation doesn't try to redo it.
