# Phase 10 — Deployment

Environments, continuous integration, the migration workflow, rollback, and the runbook.

Depends on Phase 09. Last phase.

---

## 1. Environments

| | Vercel | Neon branch | Provider mode | Data |
|---|---|---|---|---|
| Local | `next dev` | `dev` | `sandbox` | Seeded |
| Preview | Per pull request | Branch per pull request | `sandbox` | Seeded from `main`'s branch point |
| Production | `main` | `main` | `sandbox` until real data | Seeded once, then real |

Neon branches are copy-on-write, so a preview branch costs storage only for what it changes. That
is what makes per-pull-request database testing affordable here.

A preview deployment gets its own database. It must, because previews run migrations, and a
migration against a shared database from an unmerged branch is how a preview breaks production.

### 1.1 Preview deployments are not public

The deployment today is open to anyone with the URL, which was correct for a demonstration. After
Phase 02 it is behind authentication, but preview URLs additionally get Vercel's deployment
protection so that an unmerged branch is not reachable at all.

### 1.2 Variables

| Variable | Local | Preview | Production |
|---|---|---|---|
| `DATABASE_URL` | dev branch | per-PR branch | main branch |
| `DATABASE_URL_UNPOOLED` | ✓ | ✓ | ✓ |
| `BETTER_AUTH_SECRET` | dev value | preview value | **distinct** |
| `BETTER_AUTH_URL` | `http://localhost:3000` | deployment URL | canonical domain |
| `PII_ENCRYPTION_KEY` | dev value | preview value | **distinct** |
| `CRON_SECRET` | dev value | preview value | **distinct** |
| `PROVIDER_MODE` | `sandbox` | `sandbox` | `sandbox` |
| `MESSAGING_ALLOWLIST` | empty | empty | empty |

Distinct secrets per environment, always. A preview deployment sharing production's encryption key
means a pull request can decrypt production data.

---

## 2. Continuous integration

```yaml
# .github/workflows/ci.yml
on: [pull_request, push]
jobs:
  verify:
    steps:
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint .
      - run: npm run gen:enums -- --check     # Phase 01 §2.1 — fails on drift
      - run: npx drizzle-kit check            # fails on schema/migration drift
      - run: npm run check:env                # every used variable is in .env.example
      - run: npm audit --audit-level=critical
      - run: npm run build
      - run: npm run test:policies            # Phase 03 §5.3, against a Neon branch
      - run: npm run test:e2e                 # Phase 11
```

The build already passes cleanly — 0 type errors, 1 known lint warning, 0 vulnerabilities. CI
starts from a green baseline, which means the first red build is a real signal.

The one known warning is the React Compiler skip on `useReactTable`. Do not suppress it;
`docs/ARCHITECTURE.md` §10 explains why. Configure the lint step to fail on errors only.

---

## 3. Migrations

The riskiest recurring operation in the product's life.

### 3.1 Order

Migrations run **before** the new code is serving. A deployment that serves new code against an
old schema fails on every request.

```yaml
- run: npx drizzle-kit migrate      # unpooled URL, owner role
- run: vercel deploy --prod
```

### 3.2 Expand and contract

Any migration that would break the currently-running code is split across two deployments.

| | Deployment 1 | Deployment 2 |
|---|---|---|
| Rename a column | Add the new one, write both, read the old | Read the new, drop the old |
| Add a `NOT NULL` column | Add nullable with a default, backfill | Add the constraint |
| Drop a column | Stop reading it | Drop it |

Skipping this is fine until the first migration that takes longer than expected on a table that is
being written to.

### 3.3 Rules

- Generated SQL is committed and reviewed.
- `drizzle-kit push` never runs against `preview` or `main`.
- Every migration is tested on a Neon branch restored from production before it touches
  production.
- Migrations are forward-only. A rollback is a new migration, not a reversal — a down-migration
  that has already lost data cannot restore it.

---

## 4. Rollback

| Failure | Response |
|---|---|
| Bad deployment, schema unchanged | Vercel instant rollback to the previous deployment |
| Bad deployment, schema changed compatibly | Roll back the deployment. The new schema tolerates old code by §3.2 |
| Bad migration, no data loss | Forward-fix migration |
| Bad migration, data lost | Neon point-in-time restore to a branch, verify, then promote |

Point-in-time restore is the only real recovery for the last case, and its retention window
depends on the Neon plan. Confirm what the free tier gives before relying on it. If the window is
short, a nightly `pg_dump` to object storage is the alternative, and it is cheap.

`docs/SECURITY.md` §3.8: *"An untested backup is a hope."* Rehearse a restore once, during this
phase, and write down how long it took.

---

## 5. Going live

Ordered. Each step is verifiable before the next.

1. Provision Neon, apply migrations to `main`
2. Run the seed. Confirm counts match the audit §1.2 exactly
3. Set every production variable. Confirm no variable is shared with preview
4. Deploy. Confirm `/api/health` is green on all five checks
5. Run `npm run provision` to create the first Hospital Admin
6. Sign in. Complete TOTP enrolment. Confirm the audit log records it
7. Confirm signed-out access to `/admin/audit` redirects to `/login`
8. Reveal one contact detail. Confirm the entry appears on `/admin/audit`
9. Enable the GitHub Actions drain. Confirm `lastDrain` goes green
10. Let the nightly job run once. Confirm `demo.reanchor` moved seed rows and nothing else
11. Invite one more account. Confirm the invitation link works once and then does not
12. Update `docs/` — `SECURITY.md` §1 and §2.7, `ARCHITECTURE.md` §1, §5 and §11, `API.md` Part 1
    and 2, `DATABASE.md` Part 1 and 2

Step 12 is not optional. Those four documents currently describe an application with no server,
and leaving them saying so after this work is finished makes every one of them untrustworthy.

---

## 6. Runbook

Short, and in the repository rather than in someone's memory.

| Symptom | First check | Then |
|---|---|---|
| Every request 500s | `/api/health` `database` | Neon status; connection limit; expired credentials |
| Every write 500s | `/api/health` `auditPartition` | Create the missing partition manually; fix the job |
| Campaigns not sending | `/api/health` `queue`, `lastDrain` | GitHub Actions runs; the 60-day disable; `CRON_SECRET` |
| A user cannot sign in | `auth_attempts` for that email | Lockout state; clear it; check TOTP drift |
| A user sees no rows | Their role and department | RLS policy for that table; run the policy test suite |
| Charts blank after a deploy | Browser console for CSP violations | The `style-src` change in Phase 08 §1 |
| Dashboard looks empty | `/api/health` `lastReanchor` | The nightly job; run `demo.reanchor` manually |
| Reveal returns 429 | The actor's reveal count in the last hour | Whether it is legitimate. This alert is doing its job |

Last row included deliberately. A rate limit firing is not always an incident, and treating it as
one leads to raising the limit until it never fires.

---

## 7. Done when

- [ ] Three environments exist with distinct secrets, verified by comparing values
- [ ] A pull request gets its own Neon branch and its own deployment
- [ ] Preview deployments are not publicly reachable
- [ ] CI runs all nine steps and fails the build on any error
- [ ] A deliberate schema drift fails `drizzle-kit check`
- [ ] A deliberate enum drift fails `gen:enums --check`
- [ ] A variable used in code but absent from `.env.example` fails CI
- [ ] Migrations run before the deployment serves traffic
- [ ] An expand-and-contract migration is rehearsed once end to end
- [ ] A point-in-time restore is rehearsed, and the time it took is written down
- [ ] All twelve go-live steps pass
- [ ] The runbook is committed and its first three rows have been walked through
- [ ] Every stale claim in `docs/` is corrected
