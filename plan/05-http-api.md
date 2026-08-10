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
| `POST /api/webhooks/delivery/{provider}` | Delivery receipts. Signature-verified. Not under `/v1` — it is not part of the public contract |
| `POST /api/cron/drain` | Queue drain. Bearer `CRON_SECRET`. Phase 07 |
| `GET /api/health` | Liveness, database reachability, next audit partition present, queue depth. Phase 09 |

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

- [ ] Every route in `docs/API.md` §2.2–§2.6 exists and matches its documented shape
- [ ] No handler contains a database query
- [ ] No handler contains its own try/catch
- [ ] An unhandled error returns a reference and logs the detail — the response carries no stack
- [ ] A list response contains no unmasked contact value, asserted by a test that greps the body
- [ ] 404 is returned for an out-of-scope record, verified as a Nurse against another department
- [ ] Cursor pagination works on `/audit` past 10,000 entries
- [ ] An API token cannot reveal, regardless of the staff member's role
- [ ] A replayed webhook is a no-op and still returns 200
- [ ] A webhook with a bad signature is rejected before the body is parsed
- [ ] `/api/cron/drain` without the bearer secret returns 401
- [ ] `docs/API.md` Part 2 is rewritten from proposal to description
