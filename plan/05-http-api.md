# Phase 05 — HTTP API

`docs/API.md` Part 2 specifies the contract. This phase implements it as thin handlers over the
services from Phase 04.

Depends on Phase 04. Independent of Phases 06 and 07 — any order.

---

## 1. Why an API at all

Server Components and Server Actions cover every screen without HTTP. Three things still need a
network surface:

**Webhooks.** Delivery receipts arrive from outside. There is no other way to receive them.

**The reveal endpoint.** It carries its own rate limit, its own error codes, and its own audit
semantics. A documented, testable HTTP surface for the one operation the security model rests on
is worth more than the handful of lines it costs.

**Anything external, later.** A mobile client, a hospital information system, a scheduled report.
`docs/API.md` Part 2 was written for this and describes a contract worth having rather than
inventing under pressure.

Handlers are thin. If a route handler contains business logic, it belongs in a service.

---

## 2. Handler shape

Every handler is the same four steps.

```ts
// app/api/v1/patients/route.ts
export async function GET(request: NextRequest) {
  return handle(request, async (session) => {
    const filters = patientFiltersSchema.parse(searchParamsOf(request));
    const page = await patients.list(session, filters);
    return collection(page);
  });
}
```

| Step | Does |
|---|---|
| `handle` | Resolves the session, returns 401 if absent, catches `ServiceError` and maps it to the envelope, logs unmapped errors with a reference |
| Zod parse | Validates input at the boundary. Failure is 422 with field detail |
| Service call | The only place business logic lives |
| Serialise | Wraps in the collection or record envelope |

`handle` exists so that no handler writes its own try/catch. One implementation of error mapping,
one place where a 500 can leak a stack trace, one place to fix it.

---

## 3. Conventions

From `docs/API.md` §2.1, restated as implementation notes.

| Rule | Implementation |
|---|---|
| Base path `/api/v1` | Versioned from the first commit. A `v2` is cheaper than a breaking change |
| Addressed by business reference | `/patients/PT-102938`, never by UUID. Staff quote references and support tickets contain them |
| UTC on the wire | `TIMESTAMPTZ` serialised as ISO 8601 with offset. The client renders Asia/Manila |
| Money | Integer centavos in JSON. Never a float, never a formatted string |

### 3.1 Envelopes

```json
{ "data": [ ], "meta": { "page": 1, "perPage": 25, "total": 18241, "totalPages": 730 },
  "links": { "next": "/api/v1/patients?page=2", "prev": null } }
```

`/audit` uses cursor pagination instead. It grows without bound and is only ever read in timestamp
order, so `OFFSET` on page 700 is a table scan.

```json
{ "error": { "code": "REVEAL_NOT_PERMITTED",
             "message": "Your role cannot reveal contact details for patients outside your department.",
             "reference": "err_01HQ8X2K",
             "details": { "resourceId": "PT-102938", "field": "phone" } } }
```

`message` is shown to the user directly. `reference` appears in `ErrorState` for them to quote.

### 3.2 Status codes

| Status | Meaning |
|---|---|
| 400 | Malformed request |
| 401 | No or expired session |
| 403 | Authenticated, not permitted |
| 404 | Not found, **or outside the caller's row-level scope** |
| 409 | Conflict — double-booked slot, duplicate reference |
| 422 | Validation failed |
| 429 | Rate limited |

404 covering out-of-scope is deliberate. A 403 confirms the record exists.

---

## 4. Authentication for the API

Two callers, two mechanisms.

**The browser** sends the session cookie. `SameSite=Strict` plus origin checking covers CSRF for
state-changing requests. Server Actions carry Next's own action-id protection.

**A machine** sends `Authorization: Bearer <token>`. API tokens are:

```sql
CREATE TABLE api_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,     -- the token is shown once, never stored
  staff_id     UUID NOT NULL REFERENCES staff(id),
  scopes       TEXT[] NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

A token inherits the role and department of the staff member it belongs to, so RLS and the policy
matrix apply unchanged. Scopes narrow further, never widen.

No token may hold `reveal`. Automated bulk decryption is exactly the threat
`docs/SECURITY.md` §4 names as bulk exfiltration, and no integration has a legitimate need.

`/integrations` gains token management. The screen already exists as a surface.

---

## 5. Routes

`docs/API.md` §2.2 through §2.6 lists them. Implement as specified. Notes where implementation
differs from a naive reading:

**`POST /patients/{ref}/reveal`** — the whole of Phase 04 §5. Request carries `field` and an
optional `reason`; response carries `value`, `auditId`, `expiresAt`.

**`GET /patients/{ref}/timeline`** — merges appointments, follow-ups, messages, tasks, feedback,
referrals, and notes. `lib/timeline.ts` already does this and keeps working, now over DTOs
instead of seed arrays.

**`POST /leads/{ref}/convert`** — one transaction creating a patient, linking the lead, writing
stage history, and writing two audit entries. Returns both records.

**`POST /appointments`** — no availability pre-check. The exclusion constraint answers, and
`23P01` becomes 409. A pre-check races two receptionists.

**`GET /audit/export`** — writes an audit entry about itself before streaming. `docs/API.md` §2.6.

**`GET /me`** — session, role, department, and the resolved permission set. The UI hides what the
caller lacks; the server enforces regardless.

**`PATCH /me/preferences`** — density, theme, rail state. Writes `user_preferences`.

### 5.1 Not in `docs/API.md`, needed anyway

| Route | Purpose |
|---|---|
| `POST /api/v1/patients/{ref}/documents` | Upload. Multipart, 10 MB cap, magic-byte type check. Phase 08 §3.4 |
| `GET /api/v1/documents/{id}` | Download. Streamed, always `attachment`, writes an `exported` audit entry |
| `DELETE /api/v1/documents/{id}` | Soft delete. The blob is removed; the row and its audit trail are not |
| `POST /api/webhooks/delivery/{provider}` | Delivery receipts. Signature-verified. Not under `/v1` — it is not part of the public contract |
| `POST /api/cron/drain` | Queue drain. Bearer `CRON_SECRET`. Phase 07 |
| `GET /api/health` | Liveness, database reachability, next audit partition present, queue depth. Phase 09 |

Document routes are the one place a request body is not JSON and not Zod-parsed as a whole. The
metadata fields are still validated; the byte stream is validated by the controls in Phase 08
§3.4 instead.

Webhook handlers verify the signature **before** parsing the body, are idempotent on the
provider's event id, and return 200 for a duplicate rather than reprocessing.

---

## 6. Rate limiting

Beyond the reveal budget in Phase 04 §5.1, which is separate and stricter.

| Scope | Limit |
|---|---|
| Per session, all endpoints | 300 requests / minute |
| Per token, all endpoints | 60 requests / minute |
| Unauthenticated (`/login`, reset) | 10 / minute per IP |
| Webhooks | Not limited. The provider controls the rate; signature verification is the gate |

Counted in Postgres with a fixed-window table, swept nightly. Redis would be better and costs
money. At this volume a small table with an index on `(key, window_start)` is adequate, and the
implementation is behind an interface so swapping it later touches one file.

---

## 7. Done when

Marked as in Phases 03 and 04: **[x]** verified by something that ran, **[~]** partly done,
**[ ]** not done.

- [~] Every route in `docs/API.md` §2.2–§2.6 exists and matches its documented shape — 18 route
      files covering every resource, plus `/me`, `/me/preferences`, reveal, lead convert, audit
      export and `/api/health`. All 18 verified 200 with a scoped token. Missing: per-record
      detail routes for most resources (the list route exists for each), `/patients/{ref}/timeline`,
      and the document routes
- [x] No handler contains a database query — every one calls a service
- [x] No handler contains its own try/catch — `handle` owns error mapping
- [x] An unhandled error returns a reference and logs the detail — the response carries no stack
- [x] A list response contains no unmasked contact value, asserted by a test that greps the body —
      24 patients returned **0** digit runs of 7+ and **0** email addresses
- [x] 404 is returned for an out-of-scope record — the service cannot distinguish "hidden by RLS"
      from "absent", verified at the service layer as a Nurse against another department and over
      HTTP for an unknown reference
- [~] Cursor pagination works on `/audit` past 10,000 entries — the cursor is `(occurred_at, id)`
      and pages verifiably do not overlap, but the database holds ~20 entries. Never tested at
      10,000
- [x] An API token cannot reveal, regardless of the staff member's role — verified with a token
      belonging to a Hospital Admin, who can otherwise reveal: 403 `REVEAL_NOT_PERMITTED`
- [ ] A replayed webhook is a no-op and still returns 200 — no webhook route. Needs a provider
- [ ] A webhook with a bad signature is rejected before the body is parsed — same
- [ ] `/api/cron/drain` without the bearer secret returns 401 — needs the queue (Phase 07)
- [ ] `docs/API.md` Part 2 is rewritten from proposal to description

### Deferred, with reasons

- **Webhooks and `/api/cron/drain`** belong with Phase 07. A signature check needs a provider
  whose signature scheme is known, and a drain endpoint needs something to drain.
- **Document upload and download** (§5.1) need Vercel Blob and the magic-byte checks in Phase 08
  §3.4. Accepting uploads before those controls exist would be the wrong order.
- **`/patients/{ref}/timeline`** needs `lib/timeline.ts` to run over DTOs rather than seed arrays.
  That conversion is the same work Phase 06 does for every screen, and doing it here first would
  mean doing it twice.

### What building it found

- **`handle` JSON-encoded everything**, which would have delivered the audit CSV as a quoted
  string. It now passes a `NextResponse` straight through.
- **`audit.list` caps `limit` at 100**, so the export asking for 10,000 in one call would have
  produced a truncated file that looked complete. It pages through the cursor instead.
- **CSV injection.** An audit export is the file a security reviewer opens, and `=`, `+`, `-` or
  `@` at the start of a cell makes a spreadsheet evaluate it. Cells are quoted and dangerous
  leading characters prefixed.
- **`drizzle-kit generate` re-emitted two `audit_action` enum values** that
  `drizzle/manual/0008` had already added with `IF NOT EXISTS`. Unguarded, they fail on every
  database that has run `0008`; stripped from the generated migration with a comment.
- **A token session reports `impersonated: true` from `/me`.** That is the mechanism which stops
  it revealing, reused rather than duplicated, but it means the field reads oddly for a machine
  caller — `viaToken` is alongside it to say which of the two conditions applies.
