/**
 * CareFlow CRM domain model.
 * All records in this build are fictional demonstration data.
 */

export type Tone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ai"
  | "neutral";

export type Priority = "low" | "medium" | "high" | "urgent";

export type DepartmentId =
  | "cardiology"
  | "pediatrics"
  | "internal-medicine"
  | "orthopedics"
  | "dermatology"
  | "general-medicine";

export type Channel = "sms" | "email" | "whatsapp" | "call";

export type LeadSource =
  | "website"
  | "facebook"
  | "google"
  | "phone"
  | "walk-in"
  | "referral"
  | "partner"
  | "insurance";

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

export type PatientStatus = "active" | "inactive" | "new" | "archived";

export interface Patient {
  id: string;
  name: string;
  initials: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  age: number;
  gender: "Female" | "Male" | "Other";
  address: string;
  emergencyContact: { name: string; relation: string; phone: string };
  preferredChannel: Channel;
  departmentId: DepartmentId;
  doctorId: string;
  registeredAt: string;
  lastVisit: string | null;
  nextAppointment: string | null;
  status: PatientStatus;
  tags: string[];
  insurance: string | null;
  source: LeadSource;
  satisfaction: number | null;
  outstandingFollowUps: number;
  notes: string | null;
}

export type DoctorStatus = "available" | "in-consultation" | "off-duty" | "on-leave";

export interface Doctor {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  departmentId: DepartmentId;
  status: DoctorStatus;
  email: string;
  phone: string;
  appointmentsToday: number;
  patients: number;
  satisfaction: number;
  noShowRate: number;
  yearsExperience: number;
  languages: string[];
  schedule: { day: string; from: string; to: string }[];
}

export interface Department {
  id: DepartmentId;
  name: string;
  head: string;
  patients: number;
  appointments: number;
  doctors: number;
  leads: number;
  noShowRate: number;
  satisfaction: number;
  growth: number;
  floor: string;
}

export type StaffRole =
  | "Super Admin"
  | "Hospital Admin"
  | "Doctor"
  | "Nurse"
  | "Receptionist"
  | "Patient Relations"
  | "Marketing"
  | "Billing"
  | "Manager";

export interface StaffMember {
  id: string;
  name: string;
  initials: string;
  role: StaffRole;
  departmentId: DepartmentId | null;
  email: string;
  status: "active" | "invited" | "suspended";
  lastActive: string;
  mfaEnabled: boolean;
  joinedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Scheduling                                                                  */
/* -------------------------------------------------------------------------- */

export type AppointmentStatus =
  | "requested"
  | "pending"
  | "confirmed"
  | "checked-in"
  | "in-consultation"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no-show";

export type AppointmentType =
  | "Consultation"
  | "Follow-up"
  | "Procedure"
  | "Screening"
  | "Vaccination"
  | "Teleconsult";

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  departmentId: DepartmentId;
  type: AppointmentType;
  date: string;
  start: string;
  durationMinutes: number;
  location: string;
  status: AppointmentStatus;
  reason: string;
  notes: string | null;
  reminderChannel: Channel | null;
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                    */
/* -------------------------------------------------------------------------- */

export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "booked"
  | "visited"
  | "converted";

export interface Lead {
  id: string;
  name: string;
  initials: string;
  phone: string;
  email: string;
  source: LeadSource;
  departmentId: DepartmentId;
  interest: string;
  stage: LeadStage;
  ownerId: string;
  priority: Priority;
  createdAt: string;
  lastContact: string | null;
  nextFollowUp: string | null;
  value: number;
  inquiry: string;
}

export type ReferralStatus =
  | "received"
  | "assigned"
  | "contacted"
  | "scheduled"
  | "visited"
  | "completed"
  | "declined";

export interface Referral {
  id: string;
  patientName: string;
  provider: string;
  providerType: "Clinic" | "Physician" | "Hospital" | "Insurance";
  departmentId: DepartmentId;
  receivedAt: string;
  status: ReferralStatus;
  ownerId: string;
  outcome: string | null;
  value: number;
}

/* -------------------------------------------------------------------------- */
/* Work                                                                        */
/* -------------------------------------------------------------------------- */

export type FollowUpType =
  | "Post consultation"
  | "Post procedure"
  | "Missed appointment"
  | "Lab result"
  | "Medication reminder"
  | "Annual checkup"
  | "Chronic care"
  | "Referral follow-up";

export type FollowUpStatus = "pending" | "completed" | "overdue" | "scheduled";

export interface FollowUp {
  id: string;
  patientId: string;
  type: FollowUpType;
  ownerId: string;
  dueDate: string;
  priority: Priority;
  status: FollowUpStatus;
  note: string;
}

export type TaskStatus = "todo" | "in-progress" | "blocked" | "done";

export interface Task {
  id: string;
  title: string;
  patientId: string | null;
  category: "Call" | "Document" | "Coordination" | "Review" | "Admin";
  ownerId: string;
  priority: Priority;
  dueDate: string;
  status: TaskStatus;
}

/* -------------------------------------------------------------------------- */
/* Communication                                                               */
/* -------------------------------------------------------------------------- */

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  channel: Channel;
  body: string;
  sentAt: string;
  authorId: string | null;
  internal?: boolean;
}

export interface Conversation {
  id: string;
  patientId: string;
  channel: Channel;
  subject: string;
  unread: boolean;
  lastMessageAt: string;
  assignedTo: string | null;
  messages: Message[];
}

/* -------------------------------------------------------------------------- */
/* Experience                                                                  */
/* -------------------------------------------------------------------------- */

export interface Feedback {
  id: string;
  patientId: string;
  departmentId: DepartmentId;
  doctorId: string;
  rating: number;
  category: "Care quality" | "Wait time" | "Facilities" | "Staff" | "Billing";
  comment: string;
  submittedAt: string;
  status: "new" | "reviewed" | "actioned";
}

export type CaseStatus =
  | "new"
  | "assigned"
  | "investigating"
  | "waiting"
  | "resolved"
  | "closed";

export interface Complaint {
  id: string;
  patientId: string;
  departmentId: DepartmentId;
  subject: string;
  description: string;
  type: "Wait time" | "Billing" | "Staff conduct" | "Facilities" | "Care quality";
  ownerId: string;
  priority: Priority;
  status: CaseStatus;
  openedAt: string;
  slaDueAt: string;
  resolution: string | null;
}

/* -------------------------------------------------------------------------- */
/* Marketing and automation                                                    */
/* -------------------------------------------------------------------------- */

export interface Campaign {
  id: string;
  name: string;
  type:
    | "Annual checkup"
    | "Vaccination reminder"
    | "Health screening"
    | "Wellness"
    | "Follow-up"
    | "Re-engagement";
  channel: Channel;
  status: "draft" | "scheduled" | "running" | "completed" | "paused";
  audience: string;
  audienceSize: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  appointments: number;
  startedAt: string;
}

export type WorkflowNodeKind = "trigger" | "action" | "condition" | "delay";

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  status: "live" | "paused" | "draft" | "error";
  trigger: string;
  runs30d: number;
  successRate: number;
  updatedAt: string;
  nodeCount: number;
}

export interface Integration {
  id: string;
  name: string;
  category: "Hospital systems" | "Communication" | "Marketing" | "Payments" | "Developer";
  description: string;
  status: "connected" | "disconnected" | "error" | "pending";
  lastSync: string | null;
  icon: string;
}

/* -------------------------------------------------------------------------- */
/* System                                                                      */
/* -------------------------------------------------------------------------- */

export type AuditAction =
  | "viewed"
  | "revealed"
  | "created"
  | "updated"
  | "deleted"
  | "exported"
  | "signed-in"
  | "signed-out"
  | "locked";

export interface AuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  timestamp: string;
  ip: string;
  device: string;
}

export type NotificationCategory =
  | "appointments"
  | "tasks"
  | "leads"
  | "follow-ups"
  | "complaints"
  | "system"
  | "security";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href: string;
  tone: Tone;
}

export type TimelineKind =
  | "appointment"
  | "message"
  | "call"
  | "email"
  | "follow-up"
  | "referral"
  | "complaint"
  | "feedback"
  | "note"
  | "task"
  | "workflow"
  | "record";

export interface TimelineEvent {
  id: string;
  subjectId: string;
  kind: TimelineKind;
  title: string;
  detail: string | null;
  at: string;
  actor: string | null;
  tone: Tone;
}

export interface AiInsight {
  id: string;
  headline: string;
  explanation: string;
  metric: string;
  metricLabel: string;
  direction: "up" | "down" | "flat";
  action: { label: string; href: string };
}

export interface KpiDatum {
  id: string;
  label: string;
  value: string;
  raw: number;
  change: number;
  comparison: string;
  context: string;
  tone: Tone;
  series: number[];
  href: string;
  invertTrend?: boolean;
}
