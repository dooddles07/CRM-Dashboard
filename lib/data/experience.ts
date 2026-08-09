import type { Complaint } from "@/lib/types";
import { at } from "./constants";

/**
 * Patient complaints, tracked as cases against an SLA. `slaDueAt` in the past
 * on an unresolved case is a breach, surfaced in danger tone across the UI.
 * All fictional demonstration data.
 */
export const complaints: Complaint[] = [
  {
    id: "CS-9012",
    patientId: "PT-102198",
    departmentId: "internal-medicine",
    subject: "Charged for a consultation I did not attend",
    description:
      "Invoice includes a 12 July consultation the patient says never happened. Three emails to billing went unanswered before the complaint was raised.",
    type: "Billing",
    ownerId: "u-007",
    priority: "high",
    status: "new",
    openedAt: at(-1, "08:30"),
    slaDueAt: at(0, "17:00"),
    resolution: null,
  },
  {
    id: "CS-9013",
    patientId: "PT-102344",
    departmentId: "general-medicine",
    subject: "Waited over 90 minutes past appointment time",
    description:
      "Appointment booked for 10:00, seen at 11:40. No one communicated the delay until the patient asked at reception.",
    type: "Wait time",
    ownerId: "u-002",
    priority: "medium",
    status: "assigned",
    openedAt: at(-2, "12:15"),
    slaDueAt: at(-1, "12:15"),
    resolution: null,
  },
  {
    id: "CS-9014",
    patientId: "PT-102601",
    departmentId: "orthopedics",
    subject: "Scan cost never explained before it was ordered",
    description:
      "Patient consented to an MRI without being told the out-of-pocket cost. Felt pressured and wants the charge reviewed.",
    type: "Billing",
    ownerId: "u-007",
    priority: "medium",
    status: "investigating",
    openedAt: at(-4, "16:02"),
    slaDueAt: at(-1, "16:00"),
    resolution: null,
  },
  {
    id: "CS-9015",
    patientId: "PT-102712",
    departmentId: "cardiology",
    subject: "Fourth-floor waiting area is uncomfortably cold",
    description:
      "Recurring feedback that the cardiology waiting area air-conditioning is set too low, especially for elderly patients.",
    type: "Facilities",
    ownerId: "u-008",
    priority: "low",
    status: "waiting",
    openedAt: at(-6, "12:15"),
    slaDueAt: at(2, "12:00"),
    resolution: null,
  },
  {
    id: "CS-9016",
    patientId: "PT-102790",
    departmentId: "pediatrics",
    subject: "Reception staff was dismissive about a schedule change",
    description:
      "Parent reports a receptionist was curt when a same-day reschedule was requested for a sick child.",
    type: "Staff conduct",
    ownerId: "u-004",
    priority: "high",
    status: "investigating",
    openedAt: at(-5, "09:20"),
    slaDueAt: at(-1, "09:20"),
    resolution: null,
  },
  {
    id: "CS-9017",
    patientId: "PT-102938",
    departmentId: "cardiology",
    subject: "Follow-up SMS reminders stopped arriving",
    description:
      "VIP patient stopped receiving the 24-hour appointment reminders she relies on. Suspected opt-out sync issue.",
    type: "Care quality",
    ownerId: "u-012",
    priority: "medium",
    status: "resolved",
    openedAt: at(-11, "10:05"),
    slaDueAt: at(-8, "10:05"),
    resolution:
      "Reminder preference was reset during a channel migration. Re-enabled and confirmed with the patient; a monitoring check was added.",
  },
  {
    id: "CS-9018",
    patientId: "PT-102344",
    departmentId: "general-medicine",
    subject: "Prescription refill request went unanswered",
    description:
      "Patient submitted a refill request through the portal and heard nothing for four days.",
    type: "Care quality",
    ownerId: "u-006",
    priority: "medium",
    status: "closed",
    openedAt: at(-19, "14:30"),
    slaDueAt: at(-16, "14:30"),
    resolution:
      "Request had been routed to an inactive queue. Refill approved, and portal routing was corrected for general medicine.",
  },
  {
    id: "CS-9019",
    patientId: "PT-102498",
    departmentId: "dermatology",
    subject: "Billing statement duplicated a paid item",
    description:
      "A dermatology package appears twice on the statement. Patient has proof of the earlier payment.",
    type: "Billing",
    ownerId: "u-007",
    priority: "low",
    status: "resolved",
    openedAt: at(-9, "11:45"),
    slaDueAt: at(-6, "11:45"),
    resolution: "Duplicate line reversed and a corrected statement issued the same day.",
  },
];

export const complaintById = (id: string) => complaints.find((c) => c.id === id);

export const complaintsForPatient = (patientId: string) =>
  complaints.filter((c) => c.patientId === patientId);
