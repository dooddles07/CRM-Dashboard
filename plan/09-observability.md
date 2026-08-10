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
| Application errors | Sentry free tier, with scrubbing — see §4 |
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
| Reveals by one actor | > 30 in an hour |
| Reveals against one patient by different actors | > 3 in a day |
| Exports by one actor | > 5 in a day |
| Failed sign-ins | > 20 in an hour, any account |
| Failed sign-ins from one IP | > 10 in an hour |
| Role changes | Any. Always notified |
| Reveals outside 07:00–20:00 Asia/Manila | Any, on a weekend |
| Audit gap | No entries for 2 hours during working hours — the log has stopped, which is itself the alarm |

The last one matters most. Every other signal assumes the audit log is being written. A silent
audit log looks identical to a quiet day, and only an explicit check distinguishes them.

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

Sentry free tier, `@sentry/nextjs`, with three constraints:

- `sendDefaultPii: false`
- `beforeSend` runs the same key-dropping serialiser as §2.1
- Source maps uploaded and not served publicly

This is a genuine change to the product's posture. `docs/SECURITY.md` §2.7 currently states no
analytics or error-reporting SDK is installed, and that nothing phones home. Adding Sentry makes
both false and the document must be corrected in the same change — Phase 08 §6 already schedules
that edit.

**This is optional.** The argument against: it is the only component that transmits anything about
the application to a third party, and the structured logs in §2 cover most debugging needs. The
argument for: an unhandled exception in a Server Action is otherwise invisible unless someone
happens to be reading Vercel logs within the retention window.

Decide before implementing rather than during. Recorded in
[12-decisions-and-risks.md](12-decisions-and-risks.md) as an open decision, not a settled one.

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
- [ ] The Sentry decision is recorded either way, and `docs/SECURITY.md` §2.7 matches reality
