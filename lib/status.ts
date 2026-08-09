import {
  Ban,
  CalendarCheck,
  CalendarX,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleSlash,
  CircleX,
  Clock,
  Handshake,
  Hourglass,
  LogIn,
  Pause,
  PencilLine,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type {
  AppointmentStatus,
  CaseStatus,
  DoctorStatus,
  FollowUpStatus,
  LeadStage,
  PatientStatus,
  Priority,
  ReferralStatus,
  TaskStatus,
  Tone,
} from "./types";

export interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

/**
 * Every status in the product resolves through one of these maps.
 * Status is always three-channel: icon, label, colour. Never colour alone.
 */

export const appointmentStatus: Record<AppointmentStatus, StatusMeta> = {
  requested: { label: "Requested", tone: "neutral", icon: CircleDashed },
  pending: { label: "Pending confirmation", tone: "warning", icon: Hourglass },
  confirmed: { label: "Confirmed", tone: "info", icon: CalendarCheck },
  "checked-in": { label: "Checked in", tone: "info", icon: LogIn },
  "in-consultation": { label: "In consultation", tone: "ai", icon: Stethoscope },
  completed: { label: "Completed", tone: "success", icon: CircleCheck },
  cancelled: { label: "Cancelled", tone: "neutral", icon: CircleX },
  rescheduled: { label: "Rescheduled", tone: "warning", icon: RotateCcw },
  "no-show": { label: "No-show", tone: "danger", icon: CalendarX },
};

export const patientStatus: Record<PatientStatus, StatusMeta> = {
  active: { label: "Active", tone: "success", icon: CircleCheck },
  new: { label: "New", tone: "info", icon: CircleDot },
  inactive: { label: "Inactive", tone: "neutral", icon: CircleDashed },
  archived: { label: "Archived", tone: "neutral", icon: CircleSlash },
};

export const doctorStatus: Record<DoctorStatus, StatusMeta> = {
  available: { label: "Available", tone: "success", icon: CircleCheck },
  "in-consultation": { label: "In consultation", tone: "info", icon: Stethoscope },
  "off-duty": { label: "Off duty", tone: "neutral", icon: CircleDashed },
  "on-leave": { label: "On leave", tone: "warning", icon: Pause },
};

export const leadStage: Record<LeadStage, StatusMeta> = {
  new: { label: "New", tone: "info", icon: CircleDot },
  contacted: { label: "Contacted", tone: "info", icon: Send },
  qualified: { label: "Qualified", tone: "ai", icon: Sparkles },
  booked: { label: "Appointment booked", tone: "warning", icon: CalendarCheck },
  visited: { label: "Visited", tone: "success", icon: Stethoscope },
  converted: { label: "Converted", tone: "success", icon: Handshake },
};

export const referralStatus: Record<ReferralStatus, StatusMeta> = {
  received: { label: "Received", tone: "info", icon: CircleDot },
  assigned: { label: "Assigned", tone: "info", icon: CircleDashed },
  contacted: { label: "Contacted", tone: "info", icon: Send },
  scheduled: { label: "Appointment scheduled", tone: "warning", icon: CalendarCheck },
  visited: { label: "Visited", tone: "success", icon: Stethoscope },
  completed: { label: "Completed", tone: "success", icon: CircleCheck },
  declined: { label: "Declined", tone: "neutral", icon: Ban },
};

export const followUpStatus: Record<FollowUpStatus, StatusMeta> = {
  pending: { label: "Pending", tone: "warning", icon: Clock },
  scheduled: { label: "Scheduled", tone: "info", icon: CalendarCheck },
  completed: { label: "Completed", tone: "success", icon: CircleCheck },
  overdue: { label: "Overdue", tone: "danger", icon: TriangleAlert },
};

export const taskStatus: Record<TaskStatus, StatusMeta> = {
  todo: { label: "To do", tone: "neutral", icon: CircleDashed },
  "in-progress": { label: "In progress", tone: "info", icon: Play },
  blocked: { label: "Blocked", tone: "danger", icon: CircleAlert },
  done: { label: "Done", tone: "success", icon: CircleCheck },
};

export const caseStatus: Record<CaseStatus, StatusMeta> = {
  new: { label: "New", tone: "danger", icon: CircleDot },
  assigned: { label: "Assigned", tone: "warning", icon: CircleDashed },
  investigating: { label: "Investigating", tone: "warning", icon: Search },
  waiting: { label: "Waiting on patient", tone: "neutral", icon: Hourglass },
  resolved: { label: "Resolved", tone: "success", icon: CircleCheck },
  closed: { label: "Closed", tone: "neutral", icon: CircleSlash },
};

export const priorityMeta: Record<Priority, StatusMeta> = {
  low: { label: "Low", tone: "neutral", icon: CircleDashed },
  medium: { label: "Medium", tone: "info", icon: CircleDot },
  high: { label: "High", tone: "warning", icon: CircleAlert },
  urgent: { label: "Urgent", tone: "danger", icon: TriangleAlert },
};

export const campaignStatus: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", icon: PencilLine },
  scheduled: { label: "Scheduled", tone: "info", icon: Clock },
  running: { label: "Running", tone: "success", icon: Play },
  completed: { label: "Completed", tone: "success", icon: CircleCheck },
  paused: { label: "Paused", tone: "warning", icon: Pause },
};

export const workflowStatus: Record<string, StatusMeta> = {
  live: { label: "Live", tone: "success", icon: Play },
  paused: { label: "Paused", tone: "warning", icon: Pause },
  draft: { label: "Draft", tone: "neutral", icon: PencilLine },
  error: { label: "Failing", tone: "danger", icon: TriangleAlert },
};

export const integrationStatus: Record<string, StatusMeta> = {
  connected: { label: "Connected", tone: "success", icon: CircleCheck },
  disconnected: { label: "Not connected", tone: "neutral", icon: CircleDashed },
  error: { label: "Needs attention", tone: "danger", icon: TriangleAlert },
  pending: { label: "Authorising", tone: "warning", icon: Hourglass },
};

export const userStatus: Record<string, StatusMeta> = {
  active: { label: "Active", tone: "success", icon: CircleCheck },
  invited: { label: "Invited", tone: "info", icon: Send },
  suspended: { label: "Suspended", tone: "danger", icon: ShieldAlert },
};

export const feedbackStatus: Record<string, StatusMeta> = {
  new: { label: "New", tone: "info", icon: CircleDot },
  reviewed: { label: "Reviewed", tone: "neutral", icon: CircleCheck },
  actioned: { label: "Actioned", tone: "success", icon: CircleCheck },
};

export const noShowRisk = (rate: number): Tone =>
  rate >= 10 ? "danger" : rate >= 7 ? "warning" : "success";

/** Tone for a percentage change. `invert` flips it for metrics where up is bad. */
export const trendTone = (change: number, invert = false): Tone => {
  if (change === 0) return "neutral";
  const good = invert ? change < 0 : change > 0;
  return good ? "success" : "danger";
};
