# Phase 09 — Observability

Knowing the product is working, and knowing when someone is doing something they should not.

Depends on Phase 08. Small phase — one session.

---

## 1. What the free tier allows

No paid observability platform. That rules out long log retention and hosted APM, and rules in
three things that are enough.

| Need | Mechanism |
|---|---|
| Request and error logs | Structured JSON to stdout, read in Vercel runtime logs |
| Application errors | An `error_log` table in the product's own Postgres — see §4. No third-party tracker |
| Security anomalies | Queries over `audit_log`, delivered as in-app notifications |
| Liveness | `/api/health`, polled by the same GitHub Actions workflow that drains the queue |

Vercel Hobby retains runtime logs briefly. Anything that needs to outlive that window is written
to Postgres, not logged.

---

## 2. Structured logging

One logger, JSON lines, no string formatting.

```ts
log.info("reveal", {
  actorId: session.staffId, role: session.role,
  resource: "patient", resourceId: reference, field,
  durationMs, requestId,
});
```

Every log line carries `requestId`, generated in `proxy.ts` and threaded through. A user quoting
an error reference from `ErrorState` is quoting something that finds the line.

### 2.1 What must never be logged

Enforced by a serialiser that drops these keys wherever they appear in a logged object:

```
password  token  secret  authorization  cookie
phone  email  address  dateOfBirth  phoneEncrypted  emailEncrypted
```

A log line containing a decrypted phone number defeats every control in Phase 04. The reveal log
line above records *that* a reveal happened and *which field* — never the value.

### 2.2 Levels

| Level | Use |
|---|---|
| `error` | Unhandled, or a mapped 500. Always carries a reference |
| `warn` | Authorisation denial, rate limit hit, job failure, lockout |
| `info` | Auth events, reveals, exports, mutations, job completion |
| `debug` | Query timing. Off in production |

422s are not logged as errors. A malformed request is a client problem, and logging it as an error
teaches people to ignore the error level.

---

## 3. Security anomaly detection

`docs/SECURITY.md` §3.3 requires that *"volume spikes reach a human, not just the table."* The
audit log is the data source; no external service is involved.

An hourly job runs these and writes a `security` notification to Hospital Admins on a hit:

| Signal | Threshold |
|---|---|
| Reveals by one actor | > 60 in an hour, or > 250 in a day |
| Reveals against one patient by different actors | > 3 in a day |
| Exports by one actor | > 5 in a day |
| Failed sign-ins | > 20 in an hour, any account |
| Failed sign-ins from one IP | > 10 in an hour |
| Role changes | Any. Always notified |
| Reveals outside 07:00–20:00 Asia/Manila | Any, on a weekend |
| Audit gap | No entries for 2 hours during working hours — the log has stopped, which is itself the alarm |

The last one matters most. Every other signal assumes the audit log is being written. A silent
audit log looks identical to a quiet day, and only an explicit check distinguishes them.

Reveal thresholds sit deliberately below the hard limits in Phase 04 §5.1 — alert at 60 an hour,
block at 100. A human hears about the pattern before the control interrupts anyone.

Thresholds are configuration. They will be wrong at first; the first month is for tuning them
down until the notifications are worth reading.

### 3.1 Where alerts go

`/admin/security` gains an alerts panel, and each alert is also a notification with
`category: "security"`. The notification drawer already renders that category.

Email to Hospital Admins goes through the provider adapter, which in sandbox mode means the
console. Once a real provider is configured, security alerts are the first thing that should use
it — before campaigns.

---

## 4. Error tracking

**No third-party error tracker.** Decided — see [12-decisions-and-risks.md](12-decisions-and-risks.md)
D9.

Sentry was considered and rejected. It would be the only component transmitting anything about the
application to an outside service, and `docs/SECURITY.md` §2.7's claim that nothing phones home
survives largely intact without it. The structured logs in §2 cover ordinary debugging.

The gap this leaves is real and must be covered rather than ignored: an unhandled exception in a
Server Action is invisible once Vercel's log retention window passes. So errors are persisted to
the one durable store the product already has.

```sql
CREATE TABLE error_log (
  id          BIGSERIAL PRIMARY KEY,
  reference   TEXT NOT NULL UNIQUE,      -- the same one shown in ErrorState
  level       TEXT NOT NULL,             -- 'error' | 'fatal'
  message     TEXT NOT NULL,
  stack       TEXT,
  route       TEXT,
  actor_id    UUID REFERENCES staff(id),
  request_id  TEXT,
  context     JSONB,                     -- scrubbed by the §2.1 serialiser
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_recent ON error_log(occurred_at DESC);
CREATE INDEX idx_error_reference ON error_log(reference);
```

Three rules:

- The write is best-effort and never inside the failing transaction. An error logger that throws
  while logging an error is worse than no logger.
- `context` passes through the same key-dropping serialiser as §2.1. A stack trace containing a
  decrypted phone number is exactly what this must not create.
- Rows older than 90 days are deleted by the nightly job. This table is for debugging, not for
  history — the audit log is the history.

`/admin/security` gains a recent-errors panel beside the alerts panel, so a staff member quoting a
reference from `ErrorState` can be answered without shell access.

This costs one table and one insert path, and it removes the only outbound dependency the
alternative would have introduced.

---

## 5. Health

```
GET /api/health
```

```json
{
  "status": "ok",
  "checks": {
    "database": { "ok": true, "latencyMs": 34 },
    "auditPartition": { "ok": true, "coversUntil": "2026-10-01" },
    "queue": { "ok": true, "depth": 3, "oldestPendingMinutes": 2 },
    "lastDrain": { "ok": true, "minutesAgo": 4 },
    "lastReanchor": { "ok": true, "hoursAgo": 9 }
  }
}
```

Each check maps to a way this system fails quietly:

| Check | Catches |
|---|---|
| `database` | The obvious one, plus Neon cold-start latency drifting upward |
| `auditPartition` | The failure that breaks every write in the product. Phase 07 §6 step 6 |
| `queue` | A growing depth means the drain has stopped |
| `lastDrain` | Risk R4 — GitHub Actions disabled after 60 days of repository inactivity |
| `lastReanchor` | The dataset quietly ageing into the past |

The endpoint is public but returns no detail beyond these booleans and counters. The drain
workflow calls it after each run and opens a GitHub issue when a check fails, which is a free
alerting channel that reaches a person.

---

## 6. Done when

- [ ] Every log line is JSON and carries `requestId`
- [ ] A `requestId` from an `ErrorState` locates the corresponding log line
- [ ] Logging an object containing `phone` or `password` emits the key redacted
- [ ] A reveal is logged without its value, verified by grepping logs for a seed phone number
- [ ] 422s appear at `info`, not `error`
- [ ] Each anomaly signal fires once when synthesised, and does not fire on normal use
- [ ] The audit-gap check fires when inserts are paused for two hours
- [ ] `/api/health` reports a missing audit partition as a failure
- [ ] `/api/health` reports a stalled queue
- [ ] A failing health check opens a GitHub issue
- [ ] An unhandled Server Action exception writes an `error_log` row with a reference
- [ ] The reference in `ErrorState` finds that row
- [ ] A stack trace containing a decrypted value is scrubbed before it is stored
- [ ] The error logger failing does not turn a 500 into a crash
- [ ] `error_log` rows older than 90 days are deleted by the nightly job
- [ ] No third-party SDK is installed; `docs/SECURITY.md` §2.7 needs only the database-driver
      correction
