# Security

CareFlow handles the relationship layer around patient care: names, phone numbers, addresses,
appointment history, complaints. That data attracts regulation in every jurisdiction the product
would ship to.

**This build is a front-end demonstration.** It has no server, no authentication, and no real
data. Section 1 states plainly what that means. Section 2 documents the patterns that are built.
Section 3 specifies what a production deployment must add.

Report a vulnerability privately to the repository owner. Do not open a public issue.

---

## 1. Current posture

| Control | State |
|---|---|
| Authentication | **None.** Login screens do not validate credentials |
| Authorisation | **None enforced.** The permission matrix is a UI surface |
| Transport security | Not applicable, no server |
| Data at rest | Not applicable, no database |
| PII masking | Built, presentational only |
| Audit logging | Built, in memory, lost on reload |
| Session management | **None.** No tokens, no expiry |
| Rate limiting | **None** |

### What this means

Any route is reachable directly. Typing `/admin/audit` loads the audit log. Nothing checks who
you are, because there is no "who".

Masking is presentational. `mask()` in `lib/format.ts` transforms a string the browser already
holds. The full value sits in the JavaScript bundle, and anyone opening devtools reads it
without triggering an audit entry.

**Every record here is fictional.** 24 invented patients, invented phone numbers, invented
addresses. No real patient information exists in this repository, which is why the point above
is a design note rather than a breach.

Do not deploy this against real patient data. The gap is not a hardening exercise; the
enforcement layer does not exist yet.

---

## 2. What is built

The client-side patterns below are the shape the server must preserve, not a substitute for it.

### 2.1 Masking by default

Contact details render masked wherever they appear. Revealing one takes a deliberate click.

```
Phone      +63 917 421 8890  →  +63 ••• ••• ••90
Email      maria.santos@example.com  →  ma••••••@••••••.com
Address    18 Sampaguita St, Quezon City  →  ••••••••••, Quezon City
DOB        1981-03-14  →  •• ••• 1981
```

Each mask keeps what staff need to triage and drops the rest. Address keeps the city so
reception can still route a patient without seeing the street. Phone keeps two digits so someone
can match an inbound call against a record without a reveal.

`Protected` handles this everywhere: patient tables, record headers, detail panels. No screen
prints a raw phone number.

### 2.2 Reveal writes an audit entry

The reveal and the audit write happen in one `set()` call in `lib/store.ts`:

```ts
reveal: (req) => {
  const key = revealKey(req);
  if (get().revealed[key]) return;        // idempotent
  set((s) => ({
    revealed: { ...s.revealed, [key]: true },
    auditLog: [{ action: "revealed", resource: req.resource,
                 resourceId: req.resourceId, field: req.field,
                 actorId: CURRENT_USER.id, timestamp: new Date().toISOString(),
                 ...SESSION }, ...s.auditLog],
  }));
}
```

A value cannot become visible without its entry. There is no code path that unmasks without
recording.

The user sees this happen. The reveal fires a toast naming the record and linking to the log,
and the unmasked value carries a badge marking it as recorded. Staff know their access is
visible, which is the deterrent doing its work.

### 2.3 Exports record themselves

Every export writes an entry naming the filter and the row count before the toast fires:

```ts
logAudit({
  action: "exported",
  resource: "Patient list",
  resourceId: `filter:view=${view}`,
  field: `${filtered.length} records`,
});
```

An export is a bulk reveal. Treating it as a lesser event would leave the largest disclosures
unlogged.

### 2.4 The audit log is a product surface

`/admin/audit` reads the same store the reveals write to, so an action taken on `/patients`
appears there immediately. Each entry carries actor, action, resource, field, before and after
values, timestamp, IP, and device.

Auditing that lives in a log file nobody opens is auditing nobody performs. Putting it in the
navigation makes review a normal activity.

### 2.5 Data minimisation in the UI

Only Patient Relations screens surface contact details. The Command Center, analytics, reports,
and department views work entirely on aggregates.

Avatars render initials, never photographs. Stock portraits standing in for patients would be
fake medical imagery, and real ones would be the exact data this product exists to protect.

### 2.6 Destructive actions confirm with consequences

Archiving a patient opens a dialog stating what survives:

> The record leaves active patient lists and stops receiving campaigns. Appointment history,
> notes, and the audit trail are kept, and a hospital administrator can restore it at any time.

"Are you sure?" tells staff nothing. Naming what persists lets them decide.

### 2.7 Dependency posture

No runtime dependency reaches the network. Charts, tables, drag, and the workflow canvas all run
locally. Nothing phones home, and no analytics or error-reporting SDK is installed.

Fonts are self-hosted through `next/font`, so no request leaves for a font CDN.

---

## 3. Production requirements

Ordered by what blocks a deployment first.

### 3.1 Authentication

The current screens are surfaces. Behind them:

Password hashing with argon2id. Never bcrypt at defaults, never SHA-anything.

MFA required for every role. The `/admin/security` screen already tracks coverage and lists
accounts without it; the policy toggle must become real. TOTP at minimum, WebAuthn preferred.

Sessions as short-lived, httpOnly, `SameSite=Strict`, `Secure` cookies. Not `localStorage`,
which any XSS reads. Idle timeout of 30 minutes on shared workstations, matching the policy
already shown in Settings.

Progressive lockout on failed attempts, per account and per IP.

### 3.2 Authorisation

The nine-role matrix at `/admin/roles` must be enforced twice: once in the API, once in the
database.

API checks run on every request, never derived from client claims. Row-level security policies
scope a nurse to their department whether the query arrives from the UI or a stolen token. The
schema in [DATABASE.md](DATABASE.md#28-row-level-security) sketches this.

UI hiding stays as a courtesy. A hidden button is not an access control.

### 3.3 PII handling

Server-side masking is the change that matters most. **The API must never send a value the
caller has not revealed.** The list endpoint returns `{ masked, revealable }`, never the full
string. A client bug cannot leak what the server never transmitted.

Contact columns encrypted at rest with envelope encryption and keys in a KMS, not in the
application config. Masked fragments (`phone_last2`, `address_city`) stored unencrypted beside
them so a list renders without decrypting a row.

Reveal enforcement:

| Requirement | Reason |
|---|---|
| Audit insert and decryption in one transaction | A failed audit write must block the reveal |
| Rate limit per actor | 200 reveals in an hour is a manual export |
| RLS evaluated first | Out-of-scope reveals fail before decryption |
| Short-lived response | Client drops the value rather than holding it all session |
| Anomaly alerting | Volume spikes reach a human, not just the table |

Retention: define per record class, delete on schedule, log the deletion.

### 3.4 Audit integrity

Append-only. `UPDATE` and `DELETE` revoked from every application role, enforced in the database
rather than in code.

Retention of six years or longer, which is typical for health-record access logs. Quarterly
partitions make that manageable.

Consider hash chaining each entry to its predecessor, so tampering is detectable rather than
merely prohibited.

Ship entries to a separate system, since an attacker with database access should not also
control the record of it.

### 3.5 Transport and headers

TLS 1.3, HSTS with preload. A Content Security Policy with no `unsafe-eval`.
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` denying camera, microphone, and geolocation.

One known obstacle for a strict policy: `components/ui/chart.tsx` injects an inline `<style>`
block to publish per-chart colour variables. A `style-src` without `unsafe-inline` breaks every
chart. Use a nonce on that element rather than relaxing the directive globally.

Cache headers on any response carrying PII: `Cache-Control: no-store`. A shared workstation's
back button should not resurrect a patient list.

### 3.6 Input handling

Validate every request body against a schema at the boundary. Parameterised queries only.

React escapes rendered strings. Two components call `dangerouslySetInnerHTML`, both on
developer-authored content rather than anything a user supplies: `app/layout.tsx` embeds a
hidden design-direction comment, and `components/ui/chart.tsx` writes the chart colour variables
described above. Neither takes runtime input, and both should stay that way. Any future
rich-text field needs sanitising server-side.

CSRF tokens on state-changing requests, or strict `SameSite` plus origin checking.

Uploads: type allowlist, size cap, malware scan, storage outside the web root, and serving
through an authenticated endpoint rather than a public URL.

### 3.7 Compliance

The applicable regime depends on jurisdiction. For the Philippine setting the product depicts,
that is the Data Privacy Act of 2012 and its NPC implementing rules. HIPAA applies to US
deployments, GDPR to EU ones.

Common obligations across all three:

| Obligation | Where it lands |
|---|---|
| Access logging | Audit log, built in shape, needs persistence |
| Minimum necessary access | RLS plus the role matrix |
| Encryption in transit and at rest | TLS, KMS-backed column encryption |
| Breach notification | Alerting on the audit stream |
| Data subject access and erasure | Export and soft-delete endpoints |
| Retention limits | Scheduled deletion with logged proof |
| Business associate agreements | Contractual, for any processor |

### 3.8 Operations

Dependency scanning in CI, with builds failing on known critical advisories.

Secrets in a manager, never in the repository. This build has none, and that is worth keeping
true as a backend appears.

Backups encrypted, restores rehearsed. An untested backup is a hope.

Anomaly alerting on reveal volume, failed logins, permission changes, and audit gaps.

A documented incident response path: contain, assess scope from the audit log, notify within the
statutory window, remediate, review.

---

## 4. Threat notes

**Insider browsing.** The most likely real threat is a staff member with legitimate access
looking up someone they know. Prevention is impossible; detection is not. Masking makes each
lookup deliberate, the audit log makes it attributable, and rate limits plus anomaly alerts turn
a pattern into a signal. The visible badge on a revealed value tells staff the record exists,
which is most of the deterrent.

**Bulk exfiltration.** Export logging and reveal rate limits are the controls. Server-side
pagination caps how much any single request can return.

**Session theft.** Short expiry, httpOnly cookies, and binding sessions to IP or device
fingerprint with re-authentication on change.

**Stolen credentials.** MFA everywhere is the answer, which is why `/admin/security` tracks
coverage as a first-class metric rather than a settings checkbox.

---

## 5. Summary

Built: masking by default, reveals that write audit entries atomically, exports that log
themselves, an audit log staff can read, aggregate-only analytics, and confirmation dialogs that
name consequences.

Missing: authentication, authorisation enforcement, server-side masking, encryption, persistence,
rate limiting, and every operational control in section 3.

The patterns are right and the enforcement is absent. Treat this as a specification of intent
that happens to run, and build section 3 before a single real patient record goes near it.
