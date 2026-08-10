# Product requirements

**Product:** CareFlow CRM
**Customer:** St. Aurora Medical Center, a 320-bed hospital in Quezon City
**Status:** Front-end complete, running on demonstration data
**Demo clock:** 2026-08-10

---

## 1. Problem

Hospital staff manage patient relationships across systems that were never built for it. The EMR
holds clinical records and answers clinical questions. It cannot tell a receptionist which
patients missed appointments last week, show a marketing coordinator which acquisition channel
converts, or tell a patient-relations officer that the person they are about to call for a
routine follow-up has an open billing complaint.

Staff fill those gaps with spreadsheets, shared inboxes, and memory. Three failures follow:

1. **Follow-ups fall through.** Nobody owns the list, so nothing surfaces when it slips.
2. **Context is scattered.** Reconstructing one patient's history means opening four systems.
3. **Patient contact data leaks quietly.** Anyone with EMR access reads full phone numbers and
   addresses, and nothing records that they did.

CareFlow addresses the relationship layer. It sits beside the EMR, not on top of it. Clinical
records stay where they belong.

---

## 2. Users

| Role | Lives in | Needs |
|---|---|---|
| Hospital Admin | Command Center, Analytics | Load, throughput, and where the week is slipping |
| Patient Relations | Follow-ups, Inbox, Complaints | The list of people owed contact, and their history |
| Receptionist | Appointments, Calendar | Today's board, check-ins, rescheduling |
| Doctor | Patient records | Their panel and the context around a visit |
| Nurse | Patients, Follow-ups | Care follow-ups for their department |
| Marketing | Leads, Campaigns | Pipeline and channel performance |
| Billing | Complaints, Reports | Disputes and revenue reporting |
| Manager | Departments, Doctors | Team performance against thresholds |

The primary user is Patient Relations. They touch the most surfaces and carry the work the
product exists to prevent from being dropped.

---

## 3. Principles

**Familiarity is the feature.** Staff use this between patients, not in a focused session. One
anatomy for lists, one for records. Learn the patient screen and the other twelve need no
relearning.

**Status is never colour alone.** Every status carries an icon, a label, and a tone. A red dot
means nothing across a shift change.

**Protecting contact data is a visible act.** Phone numbers, emails, addresses, and dates of
birth render masked. Revealing one takes a deliberate click and writes an audit entry naming the
person, the field, and the time. The product's core promise happens on screen instead of being
claimed in a settings page.

**Empty states say what to do next.** "No patients match these filters" followed by a way to
clear them, not "No data".

**Numbers carry their comparison.** A KPI shows its value, its change, the period it compares
against, and one line of context explaining what moved.

---

## 4. Scope

### Delivered

**Command Center.** Eight KPIs with sparklines and trend context. Patient growth over twelve
months. Today's appointments. Alerts for overdue follow-ups, missed appointments, unresolved
complaints, and failing workflows. AI insights. Department mix, lead conversion, acquisition
sources, and satisfaction.

**Patients.** Table with saved views (all, new this month, needs follow-up, VIP, lapsed),
faceted filters, bulk messaging and tagging, and export that writes to the audit log. Contact
details masked. A three-step creation flow. The patient record carries nine tabs on the shared
anatomy: overview, timeline, appointments, communications, follow-ups, referrals, feedback,
documents, notes.

**Scheduling.** Appointment list scoped to today, upcoming, past, or all. Week calendar with
status-coloured blocks. Appointment detail with check-in, reschedule, and cancel.

**Pipeline.** Lead board across six stages with drag between them, plus a table view. Lead detail
with the enquiry and a derived activity timeline. Referrals from clinics, physicians, hospitals,
and insurers. Follow-ups with saved views that put overdue first. Tasks by category, status, and
owner.

**Engagement.** Inbox spanning SMS, email, WhatsApp, and logged calls, with internal notes
distinguished from patient-visible messages. Campaigns with a delivery funnel from sent through
to appointments booked.

**Experience.** Feedback with ratings, categories, and sentiment split. Complaints as cases
against an SLA, with breaches surfaced on the list, the case, and the Command Center.

**Operations.** Doctor roster and profiles with schedule, panel, and performance. Department
comparison. Staff directory.

**Insights.** Full analytics surface. Report catalogue with a builder for range and format. An
AI console with proactive insights.

**Automation.** Workflow list and a visual builder canvas showing triggers, conditions, actions,
and delays. Integration catalogue with connect toggles.

**Administration.** User management, a permission matrix across nine roles and seven areas, the
live audit log, security posture with MFA coverage, and settings.

### Out of scope

Clinical documentation, prescribing, lab ordering, bed management, and inventory. Those belong
to the EMR and the HIS.

Billing execution. CareFlow shows disputes and reports revenue. It does not process payment.

### Not built

Authentication does not validate credentials. The screens exist; any route is reachable
directly.

No server, database, or API. Data compiles into the bundle. State lives in memory and resets on
reload. [DATABASE.md](DATABASE.md) and [API.md](API.md) carry the proposed contracts.

The AI console returns a canned answer.

---

## 5. Requirements

### Must

| ID | Requirement | Status |
|---|---|---|
| R1 | Contact details render masked until deliberately revealed | Done |
| R2 | Every reveal and export writes an audit entry | Done |
| R3 | Status carries icon, label, and colour together | Done |
| R4 | Every navigation destination resolves to a working screen | Done |
| R5 | Lists support search, filtering, sorting, and pagination | Done |
| R6 | Entity records share one anatomy and layout | Done |
| R7 | Overdue follow-ups and breached SLAs surface without being sought | Done |
| R8 | One patient timeline merges every record type | Done |
| R9 | Light and dark both meet 4.5:1 for text | Done |
| R10 | No page-level horizontal scroll at 375px | Done |

### Should

| ID | Requirement | Status |
|---|---|---|
| R11 | Command palette reaches any screen or record | Done |
| R12 | Creation flows open from a URL | Done |
| R13 | Density preference applies across every table | Done |
| R14 | Leads move between stages by drag | Done |
| R15 | Workflows render as a node graph | Done |
| R16 | Bulk actions on multi-selected rows | Done |

### Could

| ID | Requirement | Status |
|---|---|---|
| R17 | Preferences persist across reload | Not built |
| R18 | Saved views persist per user | Not built |
| R19 | Calendar supports day and month views | Week only |
| R20 | Workflow canvas supports editing | Read-only |

---

## 6. Measures

Against the demonstration data, the product surfaces:

| Metric | Value | Where |
|---|---|---|
| Patients | 18,241 | Command Center |
| Appointments today | 14 | Command Center |
| Overdue follow-ups | 5 | Rail badge, alerts |
| Open leads | 12 | Leads |
| Lead conversion | 30.1% end to end | Command Center funnel |
| Satisfaction | 4.6 of 5, NPS +48 | Feedback |
| Unresolved complaints | 2, one past SLA | Alerts |
| Worst no-show rate | Pediatrics at 11.8% | AI insights |

The seed data holds deliberate tension. Pediatrics runs the worst no-show rate against the
shortest reminder window. Dermatology grows fastest against the fewest doctors. One overdue
follow-up belongs to a patient with an open billing complaint, and calling them about a routine
matter would make the case worse. These make the screens argue for something rather than
decorate.

---

## 7. Constraints

Records are fictional. No real patient information exists in this repository.

Client-side filtering holds for hundreds of records. A production deployment moves it to the
server before the patient table reaches five figures.

Masking is presentational. A real deployment withholds the value at the API until the reveal is
authorised, as described in [SECURITY.md](SECURITY.md).

Peso currency, Asia/Manila timezone, and English throughout.
