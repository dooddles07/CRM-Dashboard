# Phase 08 — Security hardening

Transport, headers, input handling, secrets, and dependencies. The controls in
`docs/SECURITY.md` §3.5, §3.6, and §3.8 that Phases 02, 03, and 04 do not cover.

Depends on Phases 05, 06, and 07 — it hardens what they build.

---

## 1. Content Security Policy

The one genuinely fiddly item in this phase, and `docs/SECURITY.md` §3.5 predicted it:

> One known obstacle for a strict policy: `components/ui/chart.tsx` injects an inline `<style>`
> block to publish per-chart colour variables. A `style-src` without `unsafe-inline` breaks every
> chart.

### 1.1 A correction to the audit

The audit lists two `dangerouslySetInnerHTML` call sites as blocking a strict CSP. Only one does.

`app/layout.tsx:57` writes an HTML comment into a hidden `div`. CSP governs script and style
execution; an HTML comment executes nothing. It is only a concern if Trusted Types are enabled,
which this plan does not propose. Leave it.

`components/ui/chart.tsx:95` is the real obstacle. It builds a `<style>` element whose content is
computed at render.

### 1.2 Fix the component, not the policy

`docs/SECURITY.md` §3.5 suggests a nonce on that element. A nonce works, but it requires threading
a per-request value from `headers()` through a React context into a component used deep inside
client trees, for the sake of one element.

There is a smaller change. The `<style>` block exists to publish CSS custom properties scoped to
`[data-chart=id]`. Those properties can be set directly on the container element instead:

```diff
- const ChartStyle = ({ id, config }) => (
-   <style dangerouslySetInnerHTML={{ __html: `[data-chart=${id}] { --color-…: …; }` }} />
- );

+ // in ChartContainer
+ <div data-chart={id} style={chartVars(config)} className={…}>
```

`chartVars` returns a plain object of `--color-*` keys. React sets them as an inline style
attribute, no element injected, no `dangerouslySetInnerHTML` anywhere in the file.

Recharts already emits inline style attributes on its SVG nodes, so the attribute channel has to
be permitted regardless. Moving the chart variables there costs nothing and removes the only
`<style>` element in the product.

### 1.3 The policy

```
default-src 'self';
script-src  'self' 'nonce-{N}' 'strict-dynamic';
style-src-elem  'self';
style-src-attr  'unsafe-inline';
img-src     'self' data: blob:;
font-src    'self';
connect-src 'self';
frame-ancestors 'none';
base-uri    'self';
form-action 'self';
object-src  'none';
upgrade-insecure-requests;
```

`style-src-elem` and `style-src-attr` separately, rather than one `style-src`. Attributes need
`unsafe-inline` because React and Recharts both set them; elements do not need it once §1.2
lands, and elements are where an injected stylesheet would do damage.

No `unsafe-eval`, per `docs/SECURITY.md` §3.5.

`connect-src 'self'` is worth noting: with `PROVIDER_MODE=live` the provider calls happen
server-side, so no browser request leaves the origin. That property is worth keeping.

### 1.4 Scripts and the nonce

Next.js propagates a nonce to its own script tags when the CSP header carries one, and
`'strict-dynamic'` lets those scripts load their own chunks.

One consumer needs it explicitly: `next-themes` injects a blocking script to set the theme before
paint, and takes a `nonce` prop. Pass it from the root layout, which reads the value the proxy
generated:

```tsx
const nonce = (await headers()).get("x-nonce") ?? undefined;
…
<ThemeProvider nonce={nonce}>
```

The proxy generates one nonce per request and sets both the CSP header and `x-nonce`.

### 1.5 Rollout

Ship `Content-Security-Policy-Report-Only` first, with a report endpoint, and watch for a week.
A CSP that breaks every chart in production is a worse outcome than a week of no CSP.

---

## 2. Other headers

Set in `proxy.ts` so they apply to every response including API routes.

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `X-Frame-Options` | `DENY` — belt and braces beside `frame-ancestors` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

The header is sent, but **the preload list is not submitted**. D10 keeps the product on its Vercel
domain, and `vercel.app` is already preloaded as a whole — a subdomain submission is neither
possible nor useful. Submit only after moving to a custom domain, and only once it is settled;
preload is difficult to reverse.

### 2.1 Cache headers on PII

```
Cache-Control: no-store, no-cache, must-revalidate
```

On every response carrying patient data, which after Phase 06 means every `(app)` route and every
`/api/v1` response except reference data.

`docs/SECURITY.md` §3.5: *"A shared workstation's back button should not resurrect a patient
list."*

Implemented in `handle` and in the `(app)` layout, not per route. A route that forgets it is the
failure mode.

---

## 3. Input handling

### 3.1 Validation

Every boundary parses with Zod before anything else runs:

| Boundary | Parses |
|---|---|
| Route handler | Query string and request body |
| Server Action | Its arguments |
| Server shell | `searchParams` |
| Webhook | Body, after signature verification |
| Job handler | `job.data` — a payload can be stale across a deployment |

Schemas live in `lib/server/schemas/` and are shared between the action and the route handler for
the same operation. Two schemas for one operation is two behaviours.

Parsing failures are 422 with per-field detail. They are not logged as errors — a malformed
request is a client problem, and logging it as an error trains people to ignore errors.

### 3.2 Queries

Drizzle parameterises. The rule is that raw SQL uses the `sql` template tag with interpolation,
never string concatenation:

```ts
sql`WHERE department_id = ${id}`          // parameterised
sql.raw(`WHERE department_id = '${id}'`)  // never
```

An ESLint rule bans `sql.raw` outside `lib/server/db/migrations/`.

### 3.3 Rich text

There is none today, and adding a rich-text field is a decision with consequences. If one appears,
it is sanitised server-side on write, not on render, and the allowlist is explicit rather than a
denylist.

### 3.4 Uploads

`/patients/[id]` lists 8 seed documents with no file behind them. They become real. This is the
one place in the product where a user-supplied byte stream enters, so it gets its own controls.

**Storage: Vercel Blob, private access.** Not the filesystem — serverless functions have no
durable one — and not a public bucket. Every object is written with `access: "private"` and is
unreachable without going through the application.

```sql
ALTER TABLE patient_documents
  ADD COLUMN blob_key      TEXT,          -- opaque, not derived from the filename
  ADD COLUMN content_type  TEXT NOT NULL,
  ADD COLUMN size_bytes    BIGINT NOT NULL,
  ADD COLUMN checksum      TEXT NOT NULL, -- sha256, for duplicate detection and integrity
  ADD COLUMN uploaded_by   UUID REFERENCES staff(id),
  ADD COLUMN scan_status   TEXT NOT NULL DEFAULT 'unscanned';
```

`blob_key` is a generated identifier, never the original filename. A filename is user input and
has no business appearing in a storage path.

#### Upload

```
POST /api/v1/patients/{ref}/documents      multipart, authenticated
```

| Control | Rule |
|---|---|
| Authorisation | `Patients: edit` **and** the row-level scope for that patient |
| Size | 10 MB hard cap, rejected at the boundary before the body is buffered |
| Type allowlist | `application/pdf`, `image/png`, `image/jpeg`, `image/webp` |
| Type checking | **Magic bytes, not the declared `Content-Type` and not the extension.** A client-declared type is a claim, not a fact |
| Filename | Stored as a display label only, escaped on render. Never used in a path, a header, or a shell |
| Rate | 20 uploads per actor per hour |
| Audit | One `created` entry naming the document, its size, and its checksum |

Rejections are 422 with a reason the user can act on — "PDF, PNG, JPEG, or WebP, up to 10 MB" —
not a generic failure.

#### Download

```
GET /api/v1/documents/{id}                 authenticated, streamed
```

Never a public blob URL. Never a long-lived signed URL — a signed URL that outlives the session is
an unauthenticated copy of a patient document sitting in someone's browser history.

```
Content-Disposition: attachment; filename="…"    -- always attachment, never inline
Content-Type: <the sniffed type, not the stored claim>
X-Content-Type-Options: nosniff
Cache-Control: no-store
```

`attachment` throughout. Rendering an uploaded file inline in the application's own origin makes
any parser bug in the browser a same-origin problem. A download is worth the extra click.

Every download writes an `exported` audit entry. A document is patient data leaving the system,
which is the definition `docs/SECURITY.md` §2.3 already applies to exports.

#### Malware scanning — an accepted gap

There is no free scanning service worth trusting, and D7 rules out paid ones. The gap is real and
is mitigated rather than closed:

- The allowlist excludes every executable and archive format
- Content sniffing means a renamed executable is rejected, not stored
- `Content-Disposition: attachment` means nothing executes in the application's origin
- `scan_status` defaults to `unscanned`, so the column exists for the day a scanner is added

This is defensible for fictional records and **not** defensible for real patient documents.
Recorded against D1 in [12-decisions-and-risks.md](12-decisions-and-risks.md) as one of the things
that must change if real data ever arrives.

---

## 4. Secrets

| Secret | Where |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Vercel environment, per environment |
| `PII_ENCRYPTION_KEY` | Vercel environment. Different value per environment |
| `BETTER_AUTH_SECRET` | Vercel environment |
| `CRON_SECRET` | Vercel environment and GitHub Actions secrets |
| Provider credentials | Vercel environment. Absent in sandbox mode |

`.gitignore` already handles `.env*` with an exception for `.env.example`. `.env.example` lists
every variable with an empty value and a comment, and CI fails if a variable used in code is
missing from it.

A leaked `PII_ENCRYPTION_KEY` means re-encrypting every contact column. `scripts/rotate-key.ts`
does it: decrypt with the old key, encrypt with the new, in batches, in one transaction per batch.
Write it during this phase rather than during an incident.

`docs/SECURITY.md` §3.8: *"This build has none, and that is worth keeping true as a backend
appears."* Keep it true.

---

## 5. Dependencies

```yaml
- run: npm audit --audit-level=critical    # fails the build
- run: npm audit --audit-level=moderate    # reports, does not fail
```

Currently zero vulnerabilities across the tree. Failing on critical costs nothing today and
catches the day it stops being true.

Dependabot weekly, grouped by ecosystem so it produces one pull request rather than fifteen.

The three deliberate version pins in `docs/ARCHITECTURE.md` §2 — TypeScript, ESLint, TanStack
Table — stay pinned. Dependabot is configured to ignore their majors, or it will open the same
pull request every week forever.

New runtime dependencies from this work: `drizzle-orm`, `@neondatabase/serverless`, `better-auth`,
`@node-rs/argon2`, `pg-boss`, `zod`, `@vercel/blob`, and a magic-byte sniffer such as
`file-type`. Eight. Each earns its place in
[12-decisions-and-risks.md](12-decisions-and-risks.md).

No error-reporting or analytics SDK, per D9. That is the one category deliberately left empty.

---

## 6. Correcting the security posture documents

`docs/SECURITY.md` §1 is a table of "None" entries. After Phases 02 through 08, every row changes.
Rewriting it is part of this phase, not a follow-up, because a security document that describes a
system two phases out of date is worse than none.

Two specific claims become false:

**§2.7 — "No runtime dependency reaches the network."** A database driver, blob storage, and — in
live mode — a message provider all do. The revised claim is narrower and still true: no *browser*
request leaves the origin, enforced by `connect-src 'self'`, and no analytics, session-replay, or
error-reporting SDK is installed. D9 keeps that second half true on purpose.

**§1 — "PII masking: built, presentational only."** After Phase 04 it is server-side and the full
value is not in the bundle. That is the single largest change in the product's actual posture and
should be stated plainly.

---

## 7. Done when

- [ ] `components/ui/chart.tsx` contains no `dangerouslySetInnerHTML`
- [ ] Charts render correctly in light and dark with `style-src-elem 'self'`
- [ ] CSP ran in report-only for a week with no violations from application code
- [ ] `next-themes` receives the nonce; no theme flash and no CSP violation
- [ ] All six headers in §2 present on an `(app)` route and on an `/api/v1` route
- [ ] A patient list is not restored by the browser back button after sign-out
- [ ] Every route handler, action, shell, webhook, and job handler parses its input with Zod
- [ ] `sql.raw` appears nowhere outside migrations; the lint rule proves it
- [ ] `.env.example` lists every variable; CI fails when one is missing
- [ ] `scripts/rotate-key.ts` re-encrypts every contact column and is tested on a Neon branch
- [ ] `npm audit --audit-level=critical` runs in CI and fails the build
- [ ] Dependabot ignores the three pinned majors
- [ ] An executable renamed to `.pdf` is rejected by magic-byte sniffing
- [ ] A 12 MB file is rejected before the body is buffered
- [ ] A document is unreachable by its blob URL without a session
- [ ] Every download sends `Content-Disposition: attachment` and writes an `exported` audit entry
- [ ] A filename containing `../` or a null byte is stored as a label and never touches a path
- [ ] `docs/SECURITY.md` §1, §2.7, and §3.6 rewritten to describe what now exists
