# CareFlow CRM

A hospital relationship-management layer that sits beside the EMR, not on top of it. Tracks patient interactions, follow-ups, complaints, leads, and staff across departments. Built for St. Aurora Medical Center.

## Language

### People

**Patient**:
A person receiving or having received care. Identified by a system-generated reference, not by name or medical record number. Contact fields (phone, email, address) are encrypted at rest and rendered masked; seeing the real value is a Reveal.
_Avoid_: client, customer, case

**Doctor**:
A physician on staff. Has a status (available, in consultation, off duty, on leave) and belongs to a Department.
_Avoid_: provider, clinician

**Staff**:
Any hospital employee with a CareFlow account. Provisioned by invitation, never self-registered. Assigned one of nine roles that govern what they can see and do.
_Avoid_: user, team member, employee

### Scheduling

**Appointment**:
A scheduled visit between a Patient and a Doctor. Progresses through: requested, pending, confirmed, checked in, in consultation, completed, cancelled, rescheduled, no show.
_Avoid_: booking, visit, slot

### Pipeline

**Lead**:
A prospective patient who has not yet visited. Moves through stages: new, contacted, qualified, booked, visited, converted. Converting a Lead creates a Patient.
_Avoid_: prospect, opportunity

**Referral**:
A patient or lead sent by an external source (another hospital, doctor, or channel). Tracks the referring source and progresses through assignment to completion.
_Avoid_: recommendation

**Follow-Up**:
A scheduled outbound contact owed to a Patient. Has a due date and status (pending, scheduled, completed, overdue). The thing most likely to fall through the cracks.
_Avoid_: callback, reminder, to-do

**Task**:
A unit of work assigned to a Staff member. Has status (todo, in progress, blocked, done) and priority. Distinct from Follow-Up: a Task is internal work, a Follow-Up is patient-facing contact.
_Avoid_: ticket, action item

### Engagement

**Conversation**:
A message thread between Staff and a Patient or external party, across any Channel (SMS, email, WhatsApp, call).
_Avoid_: chat, thread, ticket

**Campaign**:
A planned outbound communication sent to a list of recipients. Progresses through: draft, scheduled, running, completed, paused.
_Avoid_: blast, mailing, outreach

### Experience

**Feedback**:
A patient's recorded sentiment about their experience. Carries a status: new, reviewed, actioned.
_Avoid_: review, survey response

**Complaint**:
A formal grievance from a Patient. Tracked with SLA timelines and case status: new, assigned, investigating, waiting, resolved, closed. Distinct from Feedback: a Complaint demands resolution, Feedback is informational.
_Avoid_: issue, case, dispute

### Operations

**Department**:
An organizational unit within the hospital (e.g., Cardiology, Orthopedics). Doctors and Staff belong to Departments.
_Avoid_: division, unit, team

### Automation

**Workflow**:
A graph of trigger, action, condition, and delay nodes that automates CRM operations. Has status: live, paused, draft, error.
_Avoid_: automation rule, pipeline, flow

**Integration**:
A connection to an external system. Has status: connected, disconnected, error, pending.
_Avoid_: connector, plugin, app

### Security

**Reveal**:
The deliberate act of decrypting a Patient's masked contact field. Writes an audit entry naming who revealed what and when. The product's core privacy mechanism.
_Avoid_: unmask, decrypt, show

**Audit Entry**:
An immutable record of a security-relevant action (view, reveal, create, update, delete, export, sign-in, sign-out, lock, impersonation start/end). Stored in a partitioned table.
_Avoid_: log entry, event

### Channels

**Channel**:
The medium of a Conversation or Campaign message: SMS, email, WhatsApp, or call.
_Avoid_: medium, platform, method
