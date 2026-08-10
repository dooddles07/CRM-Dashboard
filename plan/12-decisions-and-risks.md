# Decisions, deferrals, and risks

Why each choice, what was consciously left out, and what could still go wrong.

Written so that a decision revisited in six months is revisited with its reasoning rather than
from scratch.

---

## 1. Programme decisions

### D1 — Fictional records on real infrastructure

Real Postgres, real authentication, real authorisation, real audit. No actual patient information.

**Why.** The gap between this build and a product is enforcement, not data. Building enforcement
against invented records proves the same thing at a fraction of the cost.

**Removed by this choice.** KMS envelope encryption, business associate agreements, a compliance
programme against the Data Privacy Act or HIPAA, penetration testing, six-year audit retention,
and a data protection officer's sign-off.

**Reversing it** means adding all of the above, plus replacing the seed contact details. Nothing
in this plan makes that harder — the encryption call site is already isolated, the audit log is
already partitioned and append-only.

### D2 — Every screen writes

Full create, read, update, and delete across all thirty-seven routes, including campaign
scheduling, workflow persistence, and integration credentials.

**Why.** Asked for directly. The alternative — a real core with the rest reading seed arrays —
leaves a visible seam in the codebase and a half-real product.

**Cost.** Roughly doubles Phase 04 and adds Phase 07 entirely.

### D3 — Real queue, swappable provider, ships pointed at a sandbox

**Why.** The seed contact details are invented Philippine mobile numbers. Sending to them either
bounces or reaches a stranger. Every write path is nonetheless production code — enqueue,
schedule, retry, delivery event, status transition — so switching to a live provider changes one
environment variable and nothing else.

**Kept honest by** the allowlist in Phase 07 §4.2, which blocks every recipient even in live mode
until it is deliberately emptied.

### D4 — No registration

Accounts are provisioned: one Hospital Admin from the command line, everyone else by invitation.

**Why.** Asked for directly. It also removes a whole category of work — email verification, abuse
controls, spam accounts, and a low-privilege role nobody wanted.

### D5 — Single tenant

One hospital. No `org_id` on any table.

**Why.** Asked for directly. It is the cheapest schema and the simplest row-level security.

**Cost if reversed.** Adding `org_id` later means a column on every table, a rewrite of every
policy, and a data migration. This is the decision in the list most expensive to change, and it
was made deliberately with that known.

### D6 — Real time, with a nightly re-anchor

`now()` everywhere. A nightly job recomputes seed row dates from the offsets they were authored
with.

**Why.** Genuine overdue follow-ups and real SLA breaches are the point of the product. A frozen
clock makes every timer decorative. Seeding once and never touching it leaves the dashboard
looking abandoned within a month.

**Why re-anchor rather than shift.** Shifting rows forward accumulates drift and is not
idempotent. Recomputing from a stored offset produces the same result whether it runs nightly or
after a week's gap.

**Protected by** `seed_anchor` being a side table. Rows created through the product have no
anchor and are never touched.

### D7 — Free tiers only

Vercel Hobby, Neon free, pg-boss inside Postgres, GitHub Actions for scheduling.

**Why.** Asked for directly.

**Accepted consequences.** Neon cold starts after idle. Queue drains every five minutes rather
than continuously. GitHub Actions schedules drift under load and disable after sixty days of
repository inactivity. Vercel Hobby prohibits commercial use, so this posture cannot survive the
product becoming one.

**The upgrade path** is about $40 a month: Vercel Pro plus Neon Launch buys minute-granularity
cron, no commercial-use restriction, Postgres that does not sleep, and point-in-time restore.

### D8 — Service layer, Server Components, Server Actions, thin REST

Rather than a REST API with client-side fetching.

**Why.** One round trip per page instead of two, which matters on a free tier where Neon cold
starts are measured in hundreds of milliseconds. And the masking rule lands in one auditable
module rather than at thirty-seven server-to-client boundaries.

**Cost.** All thirty-seven pages split into a server shell and a client body. That is Phase 06,
the largest phase.

**What was given up.** `docs/API.md` §2.7 sketches a migration that keeps pages as client
components and swaps their imports — a much smaller diff per file. It was rejected because it
puts a network round trip on every filter change and spreads loading-state handling across
thirty-seven files.

### D9 — No third-party error tracker

Structured logs plus an `error_log` table in the product's own Postgres. Sentry was considered and
rejected.

**Why.** It would be the only component transmitting anything about the application to an outside
service. `docs/SECURITY.md` §2.7's claim that nothing phones home survives largely intact without
it, and that claim is worth more here than the convenience.

**The gap it leaves, and how it is covered.** Vercel Hobby's log retention is short, so an
unhandled exception in a Server Action would otherwise vanish. Persisting errors to `error_log`
with the same reference the user sees in `ErrorState` keeps them findable, and `/admin/security`
gains a panel to read them. One table, one insert path, no outbound dependency.

**Revisit if** debugging repeatedly needs stack aggregation, release tracking, or breadcrumbs that
a flat table cannot give.

### D10 — Vercel domain for now

`crm-dashboard-beta-ebon.vercel.app`. No custom domain.

**Why.** Costs nothing, works immediately, and nothing in this programme depends on a custom
origin.

**Consequences.** HSTS preload is not submitted — `vercel.app` is already preloaded as a whole, so
a subdomain submission is neither possible nor useful. Cookies are host-only on the subdomain.
Live email sending would need SPF, DKIM, and DMARC on a domain you control, which is one more
reason `PROVIDER_MODE` stays `sandbox`.

**Kept cheap to reverse** by reading the origin from one module, `lib/server/config/origin.ts`,
rather than from scattered environment lookups. Moving is then a variable and a DNS record.

### D11 — Reveal budget set loose

100 an hour, 500 a day, per staff member. Exports consume one per row.

**Why.** Set to interrupt as little legitimate work as possible. A Patient Relations desk working
a call list should never meet the limit.

**The trade, stated plainly.** A determined insider can pull all 24 contact records in one sitting
without tripping it. They cannot do it without leaving 24 audit entries and firing an alert at the
60th. This moves the weight from prevention to detection, which is what `docs/SECURITY.md` §4
argues for anyway: *"Prevention is impossible; detection is not."*

**Revisit** after a month of real audit data. The values are configuration, so tightening them is
not a deployment.

### D12 — Real document uploads

The documents tab on `/patients/[id]` accepts real files. Vercel Blob, private access, magic-byte
type checking, 10 MB cap, authenticated streaming download, audit on both upload and download.

**Why.** D2 said every screen writes, and the documents tab was the one surface still pretending.

**The accepted gap.** No malware scanning — there is no free service worth trusting, and D7 rules
out paid ones. Mitigated by an allowlist that excludes every executable and archive format, magic-
byte checking so a renamed executable is rejected rather than stored, and
`Content-Disposition: attachment` on every download so nothing executes in the application's
origin. `scan_status` exists as a column for the day a scanner is added.

**This is defensible for fictional records and not for real ones.** It is the second item, after
D1, that must change if real patient data ever arrives.

---

## 2. Technical decisions

| # | Decision | Alternative | Why |
|---|---|---|---|
| T1 | Drizzle | Prisma | No engine binary. Prisma's adds cold-start weight on a free function, and the hand-written schema in `docs/DATABASE.md` is SQL-first already |
| T2 | Better Auth | Auth.js v5, custom | TOTP, session management, and an admin plugin cover provisioning, MFA, and `/admin/users` without custom work. Native Drizzle adapter |
| T3 | pg-boss | Inngest, Trigger.dev, QStash | Runs in the database already paid for. No second service, no second failure mode |
| T4 | `pgcrypto`, key in environment | Plaintext columns, or a KMS | Real encryption at rest for nothing. Isolated call site, so a KMS swap touches one file |
| T5 | Audit log as its own rate limiter | Redis, a counter table | The data is already there and already indexed. Zero additional state |
| T6 | Enums generated from `lib/types.ts` | Hand-written twice | Written twice, they drift. A generator plus a CI check makes drift a build failure |
| T7 | Postgres enums | Text with a check constraint | The unions in `lib/types.ts` are closed sets with a registry in `lib/status.ts`. Native enums keep both ends in step |
| T8 | `seed_anchor` as a side table | Columns on domain tables | Demo scaffolding stays out of the production schema and is dropped in one statement |
| T9 | Chart variables as a style attribute | A CSP nonce on the `<style>` element | Smaller change, and removes the only `<style>` element rather than granting it an exception |
| T10 | Per-staff `conversation_reads` | The current `unread` boolean | Two people reading one thread must not clear each other's badge. The DTO still exposes `unread`, so no screen changes |
| T11 | Campaign funnel as aggregates | Stored counters | Stored counters disagree with reality eventually. `message_events` is the truth |
| T12 | 404 for out-of-scope records | 403 | A 403 confirms the record exists |
| T13 | Reveal is a discrete capability | Derived from `Patients: view` | Marketing needs `view` for audiences and must never unmask. Deriving it would grant exactly the wrong thing |

---

## 3. Deferred

Each of these was considered and consciously left out. None is forgotten.

| # | Deferred | Why | Trigger to revisit |
|---|---|---|---|
| X1 | KMS-backed envelope encryption | D1. Environment-held keys are adequate for invented data | Real patient records |
| X2 | WebAuthn | `docs/SECURITY.md` §3.1 prefers it; TOTP is the stated minimum and covers stolen credentials | Real patient records, or a user asking |
| X3 | Audit hash chaining | Makes tampering detectable rather than merely prohibited. Grants already prohibit it | A compliance requirement |
| X4 | Shipping audit entries to a separate system | The more valuable of the two integrity measures — an attacker with database access should not also control the record of it | Real patient records. Higher priority than X3 |
| ~~X5~~ | ~~File uploads~~ | **Promoted into scope.** See D12 and Phase 08 §3.4 | — |
| X6 | A billing surface | The role matrix names Billing as an area; no route serves it. Policy for a future surface is harmless | A billing screen |
| X7 | A real AI console | `/ai` returns a canned answer. Wiring a model is a separate piece of work with its own cost and its own data-handling questions | Deliberate decision to build it |
| X8 | Server-side pagination beyond three collections | Departments, doctors, and staff are bounded by how many a hospital has | A collection passing a few hundred rows |
| X9 | Redis-backed rate limiting | D7. A Postgres fixed-window table is adequate at this volume, and sits behind an interface | Request volume, or the paid tier |
| X10 | Accessibility audit | `docs/ARCHITECTURE.md` §9 makes unverified claims. Deserves its own work, not a corner of a backend migration | Its own piece of work |
| X11 | Load testing | Measures nothing at 24 patients | Real dataset size |

---

## 4. Open

Not decided. Each needs an answer before the phase that depends on it.

Four of the five original questions are now answered and have moved into §1 and §2.

| # | Question | Needed by | Status |
|---|---|---|---|
| ~~O1~~ | Sentry, or structured logs only? | Phase 09 | **Answered.** Logs only, plus `error_log` — D9 |
| ~~O2~~ | Reveal budget numbers | Phase 04 | **Answered.** 100/hour, 500/day — D11 |
| O3 | Anomaly thresholds in Phase 09 §3 | Phase 09 | **Open.** Reveal thresholds are now pinned to D11 — alert at 60, block at 100. The other six are still guesses. Ship them, expect noise, tune down |
| O4 | Does Neon's free plan retention window make point-in-time restore a real recovery path? | Phase 10 | **Open, but it is a lookup rather than a decision.** Check the current plan when provisioning. Assume not, and add a nightly `pg_dump` to object storage until confirmed |
| ~~O5~~ | Canonical domain | Phase 10 | **Answered.** Vercel domain, no preload submission — D10 |

O3 and O4 both resolve during the phase that needs them and neither blocks starting work.

---

## 5. Risks

Carried forward from the audit, with the mitigation each plan actually implements.

| # | Risk | Mitigation | Where |
|---|---|---|---|
| R1 | The 37-page split introduces prop-threading bugs at scale | A fixed five-step recipe, one route per commit, a visual baseline diffed after each | 06 §1, 11 §5 |
| R2 | Unmasked PII reaches a Client Component through the RSC payload | The raw row type is never exported from a service module. A test greps the flight payload for seed values | 04 §2.1, 11 §2.1 |
| R3 | Neon cold start makes the app feel slow | One round trip per page by design. Pooled HTTP driver. Health check watches latency drift | 01 §1.1, 09 §5 |
| R4 | GitHub Actions schedules drift, and disable after 60 days of repository inactivity | Health check on `lastDrain`; a failing check opens an issue; Vercel's daily cron as a backstop | 07 §2.1, 09 §5 |
| R5 | RLS policies silently return empty sets instead of erroring | Policy tests assert exact row counts, not absence of exceptions | 03 §5.3, 11 §2.3 |
| R6 | Database enums drift from the TypeScript unions | Enums are generated; CI fails on drift | 01 §2.1, 10 §2 |
| R7 | The re-anchor job corrupts user-created records | Only rows listed in `seed_anchor` are touched. Tested explicitly | 01 §7.2, 07 §6, 11 §3 |
| R8 | Better Auth's schema conflicts with the hand-authored `staff` table | Kept separate and joined by `staff.user_id`. Better Auth owns its own tables | 02 §2.2 |
| R9 | Scope grows during Phase 06 as screens reveal missing endpoints | The route checklist is fixed at 37. New endpoints are logged, not built inline | 06 §5 |
| R10 | An uploaded file carries malware, since nothing scans it | Allowlist excludes executables and archives; magic-byte checking rejects renamed binaries; `attachment` on every download means nothing executes in the origin | 08 §3.4, D12 |
| R11 | `error_log` fills with a repeating error and crowds the table | 90-day deletion in the nightly job; the writer is best-effort and never inside the failing transaction | 09 §4 |

### 5.1 The two that deserve attention

**R2** is the one that would matter most if it happened, and it is the one this plan is proudest
of closing. Making the security property a compile error rather than a review checklist costs one
line of discipline per service module.

**R9** is the one most likely to happen. Phase 06 is 6–8 sessions of mechanical work, and
mechanical work is where scope creeps in as small improvements. The route checklist exists to be
the answer: thirty-seven routes, no more, and anything discovered gets written down instead of
built.

---

## 6. What this plan does not claim

Worth stating, because a plan that sounds complete invites being treated as complete.

- It is not a security certification. It implements the controls in `docs/SECURITY.md` §3 for
  invented data. A deployment holding real patient records needs D1 revisited, D12's unscanned
  uploads closed, and everything in §3 of this document reconsidered.
- The effort estimates in the README are estimates. Phases 04 and 06 are the ones that overrun.
- No phase has been executed. Every `Done when` list is a hypothesis about what will prove the
  work correct, and some of them will turn out to be the wrong checks.
