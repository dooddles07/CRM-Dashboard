# API

**No HTTP API exists.** Screens import seed arrays directly and read session state from a zustand
store. There is no server process, no fetch call, and no network boundary anywhere in the
application.

Part 1 documents the data-access layer as built. Part 2 proposes the REST contract a real
deployment would need, and how the UI would migrate onto it.

---

# Part 1: as built

## 1.1 Two access paths

```
lib/data/*.ts  ──imports──►  screen component  ──useMemo──►  filtered rows
lib/store.ts   ──selector──►  screen component  ──actions──►  set()
```

Static records come from module imports. Anything mutable comes from the store.

## 1.2 Reading seed data

Each module exports its array and the lookups that go with it. Screens use the lookups rather
than repeating a `find`:

```ts
import { appointments, appointmentsFor, appointmentsOn } from "@/lib/data/scheduling";
import { patientById, doctorById, staffName }             from "@/lib/data/people";
import { leadById }                                        from "@/lib/data/pipeline";
import { complaintById }                                   from "@/lib/data/experience";
import { campaignById, workflowById, workflowGraphs }      from "@/lib/data/marketing";
```

| Helper | Signature |
|---|---|
| `patientById` | `(id: string) => Patient \| undefined` |
| `patientName` | `(id: string) => string` (falls back to "Unknown patient") |
| `doctorById` | `(id: string) => Doctor \| undefined` |
| `staffById` / `staffName` | `(id: string) => StaffMember \| undefined` / `string` |
| `appointmentsFor` | `(patientId: string) => Appointment[]` |
| `appointmentsOn` | `(date: string) => Appointment[]` |
| `followUpsFor` / `tasksFor` | `(patientId: string) => FollowUp[] / Task[]` |
| `conversationsFor` / `feedbackFor` | `(patientId: string) => Conversation[] / Feedback[]` |
| `documentsFor` / `notesFor` | `(patientId: string) => PatientDocument[] / PatientNote[]` |
| `referralsForPatient` | `(name: string) => Referral[]` (joins by name, not id) |
| `leadsForOwner` | `(ownerId: string) => Lead[]` |
| `departmentName` | `(id: DepartmentId) => string` |

Filtering happens in the component inside `useMemo`:

```ts
const filtered = useMemo(() => {
  return appointments.filter((a) => {
    const delta = daysFromToday(a.date);
    if (scope === "today" && delta !== 0) return false;
    if (department !== "all" && a.departmentId !== department) return false;
    if (status !== "all" && a.status !== status) return false;
    return true;
  });
}, [scope, department, status]);
```

This holds at the current scale (tens to hundreds of rows). It stops holding somewhere in the
low thousands, which is the point at which part 2 stops being optional.

## 1.3 The store

`useCareflow` is a zustand store. Components subscribe with a narrow selector so unrelated
updates do not re-render them:

```ts
const patients = useCareflow((s) => s.patients);
const logAudit = useCareflow((s) => s.logAudit);
const density  = useCareflow((s) => s.density);
```

### State

| Key | Type | Notes |
|---|---|---|
| `patients` | `Patient[]` | Copied from seed on init |
| `notifications` | `AppNotification[]` | |
| `auditLog` | `AuditEntry[]` | Newest first |
| `revealed` | `Record<string, true>` | Keyed `${resourceId}:${field}` |
| `commandOpen`, `notificationsOpen` | `boolean` | |
| `railCollapsed` | `boolean` | |
| `density` | `"comfortable" \| "compact"` | Read by every `DataTable` |

### Actions

| Action | Signature |
|---|---|
| `reveal` | `(req: { resource, resourceId, field }) => void` |
| `isRevealed` | `(key: string) => boolean` |
| `logAudit` | `(entry: Omit<AuditEntry, "id" \| "actorId" \| "actorName" \| "timestamp" \| "ip" \| "device">) => void` |
| `addPatient` | `(patient: Patient) => void` |
| `updatePatient` | `(id: string, patch: Partial<Patient>) => void` |
| `markNotificationRead` / `markAllNotificationsRead` | |
| `setCommandOpen` / `setNotificationsOpen` / `toggleRail` / `setDensity` | |

### The reveal contract

`reveal()` writes the revealed key and the audit entry in a single `set()`:

```ts
reveal: (req) => {
  const key = revealKey(req);
  if (get().revealed[key]) return;          // idempotent, no duplicate audit rows
  set((s) => ({
    revealed: { ...s.revealed, [key]: true },
    auditLog: [{ id: nextAuditId(), action: "revealed", ...req, /* actor, time, ip */ },
               ...s.auditLog],
  }));
}
```

A value cannot become visible without its audit entry. Any future server implementation must
preserve that property: reveal and audit are one transaction, never two calls.

### Calling logAudit

Anything that exposes or changes data records itself. Exports do it explicitly:

```ts
logAudit({
  action: "exported",
  resource: "Patient list",
  resourceId: `filter:view=${view}`,
  field: `${filtered.length} records`,
  previousValue: null,
  newValue: null,
});
```

Actor, timestamp, IP, and device are filled by the store. Callers never supply them, and a
server implementation must take them from the session rather than the request body.

## 1.4 URL as state

Two parameters carry state instead of component state.

`?tab=` drives record tabs. `RecordHeader` renders tabs as links, so a tab is shareable and
survives reload.

`?create=1` and `?compose=1` drive creation dialogs through `ParamDialog`. Any link anywhere
opens the right flow: `/leads?create=1`, `/inbox?compose=1`, `/appointments?create=1`. The
command palette and row action menus rely on this rather than importing dialog components.

---

# Part 2: proposed REST contract

Not implemented.

## 2.1 Conventions

Base path `/api/v1`. JSON in and out. UTC `TIMESTAMPTZ` on the wire; the client renders
Asia/Manila.

Resources are addressed by business reference (`PT-102938`), not UUID. Staff quote references,
support tickets contain them, and the audit log stores them.

| Method | Use |
|---|---|
| `GET /resource` | Collection, filtered and paginated |
| `GET /resource/{ref}` | Single record |
| `POST /resource` | Create, returns 201 with `Location` |
| `PATCH /resource/{ref}` | Partial update |
| `DELETE /resource/{ref}` | Soft delete, returns 204 |

### Collection response

```json
{
  "data": [ /* records */ ],
  "meta": { "page": 1, "perPage": 25, "total": 18241, "totalPages": 730 },
  "links": { "next": "/api/v1/patients?page=2", "prev": null }
}
```

Cursor pagination for the audit log, which grows without bound and is only ever read in
timestamp order.

### Error response

```json
{
  "error": {
    "code": "REVEAL_NOT_PERMITTED",
    "message": "Your role cannot reveal contact details for patients outside your department.",
    "reference": "err_01HQ8X2K",
    "details": { "resourceId": "PT-102938", "field": "phone" }
  }
}
```

`message` is written for the person reading it, since the UI shows it directly. `reference`
appears in `ErrorState` for staff to quote to support.

| Status | Meaning |
|---|---|
| 400 | Malformed request |
| 401 | No or expired session |
| 403 | Authenticated, not permitted (includes unauthorised reveals) |
| 404 | Not found, or outside the caller's row-level scope |
| 409 | Conflict (double-booked slot, duplicate reference) |
| 422 | Validation failed |
| 429 | Rate limited (reveals carry a tighter budget) |

## 2.2 Patients

```
GET   /patients?view=&department=&doctor=&status=&insurance=&q=&page=&perPage=
GET   /patients/{ref}
POST  /patients
PATCH /patients/{ref}
DELETE /patients/{ref}                    → soft delete, status = archived
GET   /patients/{ref}/timeline            → merged Spine events
GET   /patients/{ref}/appointments
GET   /patients/{ref}/conversations
GET   /patients/{ref}/follow-ups
GET   /patients/{ref}/documents
GET   /patients/{ref}/notes
POST  /patients/{ref}/notes
```

**Contact details never appear in a list response.** The masked fragments the UI needs come
precomputed from the server:

```json
{
  "reference": "PT-102938",
  "name": "Maria Santos",
  "phone": { "masked": "+63 ••• ••• ••90", "revealable": true },
  "email": { "masked": "ma••••••@••••••.com", "revealable": true }
}
```

The full value requires an explicit reveal. A client bug cannot leak what the server never sent.

## 2.3 Reveal

The endpoint the security model rests on:

```
POST /patients/{ref}/reveal
{ "field": "phone", "reason": "inbound_call" }

200 { "field": "phone", "value": "+63 917 421 8890", "auditId": "a-4192", "expiresAt": "..." }
403 { "error": { "code": "REVEAL_NOT_PERMITTED", ... } }
429 { "error": { "code": "REVEAL_RATE_EXCEEDED", ... } }
```

Four requirements:

The audit write and the decryption happen in one transaction. If the audit insert fails, no
value is returned.

Rate limited per actor. Someone revealing 200 phone numbers in an hour is exporting a patient
list by hand, and the limit is what catches it.

Row-level security applies first. A Pediatrics nurse revealing a Cardiology patient's number
gets 403 before decryption is attempted.

`expiresAt` lets the client drop the value from memory rather than holding it for the session.

## 2.4 Scheduling

```
GET   /appointments?scope=today|upcoming|past&from=&to=&department=&doctor=&status=
GET   /appointments/{ref}
POST  /appointments                       → 409 if the slot conflicts
PATCH /appointments/{ref}
POST  /appointments/{ref}/check-in
POST  /appointments/{ref}/cancel          { "reason": "..." }
POST  /appointments/{ref}/reschedule      { "startsAt": "..." }
GET   /appointments/calendar?from=&to=&doctor=
GET   /doctors/{ref}/availability?date=   → free slots
```

Conflict detection belongs to the database exclusion constraint in
[DATABASE.md](DATABASE.md#24-scheduling). A client-side check races two receptionists booking the
same slot.

## 2.5 Pipeline, engagement, experience

```
GET   /leads?stage=&owner=&source=&q=
POST  /leads
PATCH /leads/{ref}
POST  /leads/{ref}/stage        { "stage": "qualified" }   → writes stage history
POST  /leads/{ref}/convert      → creates a patient, links, returns both

GET   /follow-ups?view=overdue|today|upcoming|completed&owner=
POST  /follow-ups/{ref}/complete
GET   /tasks?status=&category=&owner=

GET   /conversations?assignedTo=&unread=
GET   /conversations/{ref}
POST  /conversations/{ref}/messages    { "body": "...", "internal": false }
POST  /conversations                   → new thread

GET   /campaigns
GET   /campaigns/{ref}/performance
POST  /campaigns/{ref}/pause | /resume

GET   /feedback?category=&rating=&department=
GET   /complaints?status=open|breached&owner=
POST  /complaints
PATCH /complaints/{ref}                { "status": "resolved", "resolution": "..." }
```

The `internal` flag on a message is a server-side decision, not a client hint. An internal note
must never enter a delivery queue.

Complaint `status` and `sla` are derived server-side. A client that computes "breached" from a
stale clock shows the wrong queue.

## 2.6 Administration

```
GET   /audit?action=&actor=&resource=&from=&to=&cursor=
GET   /audit/export                       → itself writes an audit entry
GET   /admin/users
POST  /admin/users/invite
PATCH /admin/users/{id}/role
POST  /admin/users/{id}/suspend
GET   /admin/security/posture             → MFA coverage, policy state
GET   /me                                 → session, role, permissions
PATCH /me/preferences                     { "density": "compact" }
```

`/audit` is read-only over HTTP. No endpoint updates or deletes an entry, matching the revoked
grants in the schema.

`/me` returns the permission set so the UI hides what the caller cannot use. Hiding is a
courtesy; the server enforces regardless.

## 2.7 Migration path

The UI is already shaped for this. Screens read through the helper functions in `lib/data/`
rather than reaching into arrays, so the swap is contained:

1. Replace each `lib/data/*.ts` module with a fetch layer keeping the same function names and
   return types. `patientById(id)` becomes async; the call sites already treat it as a lookup.
2. Move `useMemo` filtering into query parameters. Filter state already lives in component state
   and maps to the query string.
3. Keep the store for UI preferences and optimistic updates. Server state moves to a query cache.
4. Point `Protected` at `POST /reveal` instead of the local `reveal()` action. The component
   contract is unchanged: mask, click, unmask, badge.
5. Add loading and error states. The skeletons in `components/data/skeletons.tsx` were built for
   this step and currently render only on `/design-system`. `ErrorState` already handles
   not-found on every detail page and extends to network failures unchanged.

Two behaviours must survive the move: reveal stays atomic with its audit write, and lists keep
never carrying unmasked PII.
