# Phase 07 — Jobs and messaging

Campaigns that actually send, reminders that fire, workflows that run, and the nightly job that
keeps the dataset looking like a live operating day.

Depends on Phase 04. Independent of Phases 05 and 06.

---

## 1. The constraint that shapes everything

The seed contact details are invented Philippine mobile numbers and invented email addresses.
Sending to them either bounces or reaches a stranger who happens to own that number.

So: **the queue is real and the provider is swappable.** Every write path — enqueue, schedule,
retry, delivery event, status transition — is production code writing to Postgres. The adapter at
the end of it ships pointed at a sandbox that records what would have been sent and generates
realistic delivery events.

One environment variable moves it to a live provider. Nothing else changes.

---

## 2. pg-boss, in pull mode

```
npm i pg-boss
```

pg-boss normally runs as a long-lived worker holding a database connection and listening. That is
wrong here twice over: a serverless function does not stay alive, and a held connection defeats
Neon's scale-to-zero, which is the thing making the free tier free.

Use the pull API instead.

```ts
// app/api/cron/drain/route.ts
export async function POST(request: NextRequest) {
  if (!bearerMatches(request, process.env.CRON_SECRET)) return unauthorised();

  const boss = await getBoss();                 // connect
  const deadline = Date.now() + 50_000;         // stay inside the function timeout

  for (const queue of QUEUES) {
    while (Date.now() < deadline) {
      const jobs = await boss.fetch(queue, { batchSize: 10 });
      if (!jobs?.length) break;
      for (const job of jobs) {
        try   { await handlers[queue](job.data); await boss.complete(queue, job.id); }
        catch (e) { await boss.fail(queue, job.id, { message: String(e) }); }
      }
    }
  }

  await boss.stop();                            // release the connection
  return Response.json({ drained: … });
}
```

Three properties this must hold:

- **Bounded.** It stops before the function timeout rather than being killed mid-job. A killed
  invocation leaves jobs in `active` until pg-boss expires them.
- **Connection released.** `boss.stop()` on every path, including the error path.
- **Idempotent handlers.** A job may run twice — a timeout during `complete()` is
  indistinguishable from a crash. Every handler checks whether its effect already exists.

pg-boss creates its own `pgboss` schema. Grant `careflow_app` usage on it; it is not covered by
the `public` grants in Phase 01 §1.2.

### 2.1 Scheduling

Vercel Hobby allows one cron job at daily granularity. That is not enough to drain a queue.

GitHub Actions fills the gap:

```yaml
# .github/workflows/drain.yml
on:
  schedule: [{ cron: "*/5 * * * *" }]
  workflow_dispatch:
jobs:
  drain:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST "$URL/api/cron/drain" \
               -H "Authorization: Bearer $CRON_SECRET"
        env:
          URL: ${{ secrets.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

Two known limitations, both risk R4:

- Scheduled workflows are queued, not guaranteed. Under GitHub load a five-minute schedule can
  drift to fifteen. Acceptable for reminders, not for anything interactive — so nothing
  interactive goes through the queue.
- Scheduled workflows are disabled automatically after 60 days without repository activity. The
  health check in Phase 09 alerts on queue depth, which catches it.

Vercel's single daily cron runs the nightly maintenance in §6 and doubles as a backstop drain.

---

## 3. Queues

| Queue | Payload | Idempotency key |
|---|---|---|
| `campaign.launch` | `campaignId` | Campaign status is not `draft` |
| `message.send` | `outboundMessageId` | `outbound_messages.status != 'queued'` |
| `delivery.simulate` | `outboundMessageId`, `event`, `at` | Event already present in `message_events` |
| `reminder.schedule` | `appointmentId`, `offsetHours` | A reminder message already exists for that pair |
| `workflow.advance` | `runId`, `nodeId` | `workflow_run_steps` has the node |
| `followup.sweep` | none | Runs nightly, writes notifications only |
| `complaint.sla` | none | Runs hourly, notifies on approach and breach |
| `demo.reanchor` | none | Idempotent by construction, §6 |
| `maintenance.nightly` | none | §6 |

`campaign.launch` resolves the audience query into `campaign_recipients` and enqueues one
`message.send` per recipient. It does not send. Splitting resolution from delivery means a
campaign of ten thousand recipients does not need one function invocation to survive.

`followup.sweep` writes notifications only. Follow-up status is derived from a view
(`docs/DATABASE.md` §2.5) and cannot go stale, so nothing needs updating — but "you have four
overdue follow-ups" still needs a human told.

---

## 4. Provider adapters

```
lib/server/providers/
  types.ts          the interface
  index.ts          selects by PROVIDER_MODE
  sandbox/sms.ts    sandbox/email.ts
  live/twilio.ts    live/resend.ts
```

```ts
export interface MessageProvider {
  readonly name: string;
  send(msg: OutboundMessage): Promise<{ providerRef: string; status: DeliveryStatus }>;
}
```

| `PROVIDER_MODE` | Behaviour |
|---|---|
| `sandbox` (default) | Records the send, returns a synthetic reference, enqueues simulated delivery events |
| `live` | Calls Twilio and Resend. Requires credentials, and refuses to start without them |

### 4.1 The sandbox is not a stub

It exercises the full path, which is the point. On send it:

1. Writes `outbound_messages.status = 'sent'` and a `sent` event
2. Enqueues `delivery.simulate` with a `delivered` event 2–30 seconds out
3. For email, enqueues `opened` at a plausible rate and delay, and `clicked` as a fraction of
   opens
4. Fails a small proportion outright with a realistic reason, so the failure path gets exercised

Simulated events arrive through the same webhook handler a real provider would call. The code
under test is the production code.

Rates are configuration. Setting every rate to zero gives a silent sandbox for a demo where
moving numbers would distract.

### 4.2 The live guard

Even in `live` mode, `MESSAGING_ALLOWLIST` gates recipients. Empty means send to nobody. This
exists so that flipping the mode to test an integration cannot page a stranger at 3am because the
seed data was still loaded.

Removing the allowlist is a deliberate act taken once, when the data is real.

---

## 5. Reminders

`Appointment.reminderChannel` already exists on the model. On create or reschedule,
`reminder.schedule` is enqueued for T-24h and T-2h.

Rules:

- Cancelling or rescheduling cancels pending reminders for that appointment. A reminder for a
  cancelled appointment is worse than no reminder.
- No reminder is sent between 21:00 and 08:00 Asia/Manila. It is deferred to 08:00.
- A patient with `preferredChannel` set gets that channel; otherwise SMS.
- Reminders respect the same allowlist.

---

## 6. Nightly maintenance

One daily Vercel cron, running in order:

| Step | Does |
|---|---|
| 1 | `demo.reanchor` — recompute seed row dates from `seed_anchor`, Phase 01 §7.2 |
| 2 | Refresh `department_rollup` |
| 3 | `followup.sweep` — notify owners of overdue work |
| 4 | Delete `auth_attempts` older than 30 days |
| 5 | Delete rate-limit windows older than 1 day |
| 6 | Create the next quarter's `audit_log` partition if it is within 30 days |
| 7 | Expire invitations past `expires_at` |
| 8 | Report queue depth and oldest pending job to the health endpoint |

Step 1 only touches rows listed in `seed_anchor`. Anything created through the product has no
anchor and is never moved — risk R7, and the reason the anchor is a side table rather than columns
on the domain tables.

Step 6 is the one that breaks the product if it is missed. A missing partition makes every audit
insert fail, and every write in the product writes audit. The health check asserts the partition
exists rather than trusting the job ran.

---

## 7. Workflows

`/automations/[id]` renders a real graph after Phase 06. Making it run:

A workflow has a trigger (`patient.created`, `appointment.completed`, `lead.stage_changed`,
`schedule`). Services emit domain events after a successful transaction; the event handler creates
a `workflow_run` and enqueues `workflow.advance` for the entry node.

Each node kind does one thing:

| Kind | Effect |
|---|---|
| `trigger` | Entry point, no effect |
| `action` | Enqueues a `message.send`, creates a task, or updates a field |
| `condition` | Evaluates against the subject, follows the matching edge |
| `delay` | Enqueues the next `workflow.advance` with a start-after |

Guards, because a workflow builder is a loop generator:

- Maximum 100 steps per run. Exceeding it fails the run with a named error, visible on the detail
  page.
- Maximum one active run per workflow per subject.
- A node erroring fails the run, records the error on `workflow_runs`, and does not retry
  automatically. Silent retries on a node that sends a message send it repeatedly.

Emitting events after the transaction, not inside it, means a rolled-back write triggers nothing.

---

## 8. Done when

- [ ] `POST /api/cron/drain` without the bearer secret returns 401
- [ ] The drain endpoint releases its connection on the error path, verified by connection count
- [ ] Every handler run twice produces the same end state as once
- [ ] GitHub Actions drains every five minutes against the deployed app
- [ ] Launching a campaign creates one `campaign_recipients` row per matching patient and sends
      nothing synchronously
- [ ] Funnel numbers on `/campaigns` are counted from `message_events`, not stored
- [ ] A simulated delivery arrives through the same webhook handler a real provider would use
- [ ] `PROVIDER_MODE=live` with an empty allowlist sends to nobody
- [ ] `PROVIDER_MODE=live` without credentials refuses to start
- [ ] An internal note never produces an `outbound_messages` row
- [ ] Cancelling an appointment cancels its pending reminders
- [ ] A reminder due at 02:00 is deferred to 08:00 Asia/Manila
- [ ] `demo.reanchor` run twice in succession changes nothing
- [ ] `demo.reanchor` does not touch a patient created through the UI
- [ ] The audit partition job creates next quarter's partition before it is needed
- [ ] A workflow with a cycle fails at 100 steps with a named error on the run record
