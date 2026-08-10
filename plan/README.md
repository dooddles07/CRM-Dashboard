# Going live

CareFlow CRM runs today as a front-end demonstration: 37 screens, 20,782 lines, every record
compiled into the bundle. This folder plans the work that turns it into a running product with a
database, an HTTP API, real authentication, and enforced authorisation.

Nothing in `lib/data/` is deleted. Those records become the seed corpus.

Read [00-current-state-audit.md](00-current-state-audit.md) first. It is the inventory everything
else is measured against.

---

## Decisions already made

These were settled before planning and are not revisited in the documents below. Each one prunes
work that would otherwise appear.

| Decision | Choice | What it removes |
|---|---|---|
| Data reality | Fictional records on real infrastructure | KMS envelope encryption, BAAs, HIPAA/DPA compliance programme, penetration testing, six-year retention |
| Backend scope | Every screen writes. Full CRUD across all 37 | — |
| Message delivery | Real queue, swappable provider, ships pointed at a sandbox | Paid Twilio/Resend accounts, sender registration, deliverability setup |
| Registration | None. Accounts are provisioned | Signup route, email verification flow, abuse controls |
| Tenancy | Single hospital | `org_id` on every table, tenant isolation policies, provisioning console |
| Time | Real `now()`, nightly re-anchored demo dataset | Nothing; adds `seed_anchor` |
| Budget | Free tiers only | Upstash Redis, Vercel Pro cron, Neon paid compute |
| Data access | Service layer, Server Components, Server Actions, thin REST | A client-side query cache and 37 sets of fetch hooks |
| Error tracking | Structured logs plus an `error_log` table. No Sentry | The only outbound dependency the alternative would add |
| Domain | The Vercel-assigned one | Custom DNS, SPF/DKIM/DMARC, an HSTS preload submission |
| Reveal budget | 100 an hour, 500 a day | Nothing — it shifts weight from prevention to detection |
| Documents | Real uploads, Vercel Blob, private | Malware scanning, which has no trustworthy free option |

Rationale for each is in [12-decisions-and-risks.md](12-decisions-and-risks.md).

---

## Stack

| Piece | Choice | Reason |
|---|---|---|
| Database | Neon Postgres | Vercel-native, scales to zero, branch per pull request |
| File storage | Vercel Blob, private access | Serverless functions have no durable filesystem. Free tier, and no public bucket to misconfigure |
| ORM | Drizzle | No engine binary. Prisma's adds cold-start weight that matters on a free function |
| Auth | Better Auth | TOTP, session management, and an admin plugin cover provisioning, MFA, and `/admin/users` without custom work |
| Hashing | `@node-rs/argon2` | argon2id, per SECURITY.md §3.1 |
| Queue | pg-boss | Runs inside the same Postgres. No second service, no cost |
| Scheduler | GitHub Actions cron | Vercel Hobby allows one daily job. Actions runs every five minutes for free |
| Validation | Zod | One schema per boundary, shared by the API and Server Actions |
| Encryption | `pgcrypto` symmetric, key in environment | Real encryption at rest at zero cost. The call site is identical when a KMS replaces it |

---

## Documents

| # | Document | Covers |
|---|---|---|
| 00 | [Current state audit](00-current-state-audit.md) | Inventory, gaps, risk register |
| 01 | [Foundation](01-foundation.md) | Neon, Drizzle, schema, migrations, seeding from `lib/data` |
| 02 | [Authentication](02-authentication.md) | Better Auth, argon2id, TOTP, sessions, lockout, provisioning |
| 03 | [Authorisation](03-authorisation.md) | The nine-role matrix as code, Postgres row-level security |
| 04 | [Service layer](04-service-layer.md) | Services, DTOs, masking, the audit writer, the reveal transaction |
| 05 | [HTTP API](05-http-api.md) | `/api/v1` per the contract in `docs/API.md`, webhooks, cron |
| 06 | [Screen migration](06-screen-migration.md) | The per-page recipe, applied 37 times |
| 07 | [Jobs and messaging](07-jobs-and-messaging.md) | pg-boss, provider adapters, campaigns, reminders, re-anchoring |
| 08 | [Security hardening](08-security-hardening.md) | CSP with nonce, headers, rate limits, secrets, dependency scanning |
| 09 | [Observability](09-observability.md) | Logging, anomaly alerting, health checks |
| 10 | [Deployment](10-deployment.md) | Environments, CI, migration workflow, rollback, runbook |
| 11 | [Verification](11-verification.md) | Acceptance criteria per phase, test strategy |
| 12 | [Decisions and risks](12-decisions-and-risks.md) | Why each choice, what is deferred, what could go wrong |

---

## Sequence

Phases are ordered by what blocks what. Each ends at a state you can deploy.

```
01 Foundation ──► 02 Authentication ──► 03 Authorisation ──► 04 Service layer
                                                                   │
                        ┌──────────────────────┬───────────────────┤
                        ▼                      ▼                   ▼
                  05 HTTP API          06 Screen migration   07 Jobs
                        └──────────────────────┴───────────────────┘
                                               │
                                               ▼
                                    08 Security hardening
                                               │
                                               ▼
                              09 Observability ──► 10 Deployment
```

05, 06, and 07 depend only on 04 and can proceed in any order. 06 is the largest by volume; 04 is
the largest by consequence.

11 Verification is not a phase. Its acceptance criteria are checked at the end of each of the
others.

---

## Effort

Estimates are working sessions, not calendar time. They assume one person and no parallelism.

| Phase | Sessions | Dominated by |
|---|---|---|
| 01 Foundation | 3–4 | Schema authoring, seed transformation |
| 02 Authentication | 2–3 | TOTP enrolment and the invite flow |
| 03 Authorisation | 2 | RLS policies and testing them |
| 04 Service layer | 4–5 | 20 services, DTOs, the reveal transaction |
| 05 HTTP API | 3–4 | Route handlers, plus the document upload and download path |
| 06 Screen migration | 6–8 | 37 pages, mechanical but unavoidable |
| 07 Jobs and messaging | 3–4 | Provider adapters and delivery simulation |
| 08 Security hardening | 3 | The `chart.tsx` CSP change and the upload controls |
| 09 Observability | 1–2 | `error_log` replaces a hosted tracker |
| 10 Deployment | 1–2 | CI and the migration workflow |

Roughly 28–37 sessions. The two that overrun are 04 and 06.

---

## Status

Update as phases land.

| Phase | Status |
|---|---|
| 00 Audit | Complete |
| 01 Foundation | Complete — not yet merged to `main` |
| 02 Authentication | Not started |
| 03 Authorisation | Not started |
| 04 Service layer | Not started |
| 05 HTTP API | Not started |
| 06 Screen migration | Not started |
| 07 Jobs and messaging | Not started |
| 08 Security hardening | Not started |
| 09 Observability | Not started |
| 10 Deployment | Not started |

---

## Relationship to `docs/`

`docs/` describes the product as built. This folder describes work not yet done. They must not
merge.

Three documents in `docs/` already contain proposals these plans implement:

- `docs/DATABASE.md` Part 2 — a PostgreSQL schema. [01-foundation.md](01-foundation.md) implements
  and extends it.
- `docs/API.md` Part 2 — a REST contract. [05-http-api.md](05-http-api.md) implements it.
- `docs/SECURITY.md` §3 — production requirements. Phases 02, 03, 04, and 08 discharge them.

When a phase lands, the corresponding `docs/` section moves from proposal to description. That
edit is part of the phase, not a follow-up.

Two claims in `docs/` become false during this work and must be corrected when they do:

- `SECURITY.md` §2.7 states no runtime dependency reaches the network. A database driver and a
  message provider both will.
- `ARCHITECTURE.md` §11 states state lives in memory and resets on reload. It will not.
