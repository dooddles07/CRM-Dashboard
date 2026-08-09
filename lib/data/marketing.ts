import type {
  Campaign,
  Integration,
  WorkflowNodeKind,
  WorkflowSummary,
} from "@/lib/types";
import { at, day } from "./constants";

/* -------------------------------------------------------------------------- */
/* Campaigns                                                                   */
/* -------------------------------------------------------------------------- */

/** Outreach campaigns and their delivery funnel. Fictional demonstration data. */
export const campaigns: Campaign[] = [
  {
    id: "CMP-201",
    name: "Annual check-up reminders — Q3",
    type: "Annual checkup",
    channel: "email",
    status: "running",
    audience: "Patients due for a yearly physical",
    audienceSize: 3120,
    sent: 3120,
    delivered: 3016,
    opened: 1584,
    clicked: 512,
    appointments: 214,
    startedAt: at(-9, "08:00"),
  },
  {
    id: "CMP-202",
    name: "Flu vaccination drive",
    type: "Vaccination reminder",
    channel: "sms",
    status: "running",
    audience: "All active patients over 60",
    audienceSize: 1840,
    sent: 1840,
    delivered: 1798,
    opened: 1201,
    clicked: 388,
    appointments: 176,
    startedAt: at(-5, "09:30"),
  },
  {
    id: "CMP-203",
    name: "Skin cancer screening month",
    type: "Health screening",
    channel: "email",
    status: "scheduled",
    audience: "Dermatology leads and lapsed patients",
    audienceSize: 960,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    appointments: 0,
    startedAt: day(4),
  },
  {
    id: "CMP-204",
    name: "Win-back — lapsed patients",
    type: "Re-engagement",
    channel: "whatsapp",
    status: "running",
    audience: "No visit in 12+ months",
    audienceSize: 2450,
    sent: 2450,
    delivered: 2337,
    opened: 1402,
    clicked: 476,
    appointments: 133,
    startedAt: at(-14, "10:00"),
  },
  {
    id: "CMP-205",
    name: "Post-discharge wellness series",
    type: "Wellness",
    channel: "email",
    status: "completed",
    audience: "Discharged in the last quarter",
    audienceSize: 1275,
    sent: 1275,
    delivered: 1240,
    opened: 806,
    clicked: 297,
    appointments: 88,
    startedAt: day(-46),
  },
  {
    id: "CMP-206",
    name: "Pediatric immunisation follow-up",
    type: "Follow-up",
    channel: "sms",
    status: "paused",
    audience: "Children with an overdue dose",
    audienceSize: 540,
    sent: 312,
    delivered: 305,
    opened: 214,
    clicked: 79,
    appointments: 41,
    startedAt: at(-8, "08:15"),
  },
  {
    id: "CMP-207",
    name: "Executive health package launch",
    type: "Health screening",
    channel: "email",
    status: "draft",
    audience: "Corporate partner contacts",
    audienceSize: 420,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    appointments: 0,
    startedAt: day(9),
  },
];

export const campaignById = (id: string) => campaigns.find((c) => c.id === id);

/* -------------------------------------------------------------------------- */
/* Automation workflows                                                        */
/* -------------------------------------------------------------------------- */

export const workflows: WorkflowSummary[] = [
  {
    id: "WF-01",
    name: "Appointment reminder cascade",
    description: "Sends staged reminders and reschedules no-shows across SMS and email.",
    status: "live",
    trigger: "Appointment booked",
    runs30d: 4820,
    successRate: 98.6,
    updatedAt: day(-3),
    nodeCount: 6,
  },
  {
    id: "WF-02",
    name: "New lead auto-assignment",
    description: "Routes inbound leads to an owner by department and source, then notifies them.",
    status: "live",
    trigger: "Lead created",
    runs30d: 612,
    successRate: 99.2,
    updatedAt: day(-6),
    nodeCount: 5,
  },
  {
    id: "WF-03",
    name: "Post-visit satisfaction survey",
    description: "Waits a day after a completed visit, then sends a one-tap rating request.",
    status: "live",
    trigger: "Appointment completed",
    runs30d: 2140,
    successRate: 97.4,
    updatedAt: day(-1),
    nodeCount: 4,
  },
  {
    id: "WF-04",
    name: "Overdue follow-up escalation",
    description: "Escalates follow-ups still open past their due date to the team lead.",
    status: "error",
    trigger: "Follow-up overdue",
    runs30d: 188,
    successRate: 82.1,
    updatedAt: day(-2),
    nodeCount: 5,
  },
  {
    id: "WF-05",
    name: "Lapsed-patient win-back",
    description: "Enrols patients with no visit in 12 months into the re-engagement campaign.",
    status: "paused",
    trigger: "No visit in 365 days",
    runs30d: 0,
    successRate: 94.0,
    updatedAt: day(-12),
    nodeCount: 4,
  },
  {
    id: "WF-06",
    name: "Complaint SLA watchdog",
    description: "Alerts the owner and manager when a case nears or breaches its SLA.",
    status: "live",
    trigger: "Complaint opened",
    runs30d: 96,
    successRate: 100,
    updatedAt: day(-4),
    nodeCount: 5,
  },
  {
    id: "WF-07",
    name: "Birthday greeting",
    description: "Sends a personalised greeting on a patient's birthday.",
    status: "draft",
    trigger: "Patient birthday",
    runs30d: 0,
    successRate: 0,
    updatedAt: day(-20),
    nodeCount: 3,
  },
];

export const workflowById = (id: string) => workflows.find((w) => w.id === id);

/** A node in a workflow's visual graph, laid out for the builder canvas. */
export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  detail: string;
  /** Grid position on the canvas, in node steps (multiplied out by the view). */
  x: number;
  y: number;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  /** Optional branch label, e.g. the outcome of a condition. */
  label?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/**
 * Node graphs for the detail canvas. Not every workflow needs one wired for the
 * demo; the two below drive the builder view and the rest fall back to a
 * generated linear sketch.
 */
export const workflowGraphs: Record<string, WorkflowGraph> = {
  "WF-01": {
    nodes: [
      { id: "n1", kind: "trigger", label: "Appointment booked", detail: "Any department", x: 0, y: 1 },
      { id: "n2", kind: "delay", label: "Wait until 48h before", detail: "Relative to start time", x: 1, y: 1 },
      { id: "n3", kind: "action", label: "Send SMS reminder", detail: "Preferred channel first", x: 2, y: 1 },
      { id: "n4", kind: "condition", label: "Confirmed?", detail: "Patient replied YES", x: 3, y: 1 },
      { id: "n5", kind: "action", label: "Mark confirmed", detail: "Update appointment", x: 4, y: 0 },
      { id: "n6", kind: "action", label: "Send email + call task", detail: "Escalate to reception", x: 4, y: 2 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5", label: "Yes" },
      { from: "n4", to: "n6", label: "No" },
    ],
  },
  "WF-06": {
    nodes: [
      { id: "n1", kind: "trigger", label: "Complaint opened", detail: "Any case type", x: 0, y: 1 },
      { id: "n2", kind: "action", label: "Assign owner", detail: "By department", x: 1, y: 1 },
      { id: "n3", kind: "delay", label: "Wait until 4h before SLA", detail: "Relative to due time", x: 2, y: 1 },
      { id: "n4", kind: "condition", label: "Still open?", detail: "Not resolved or closed", x: 3, y: 1 },
      { id: "n5", kind: "action", label: "Alert owner + manager", detail: "Push + email", x: 4, y: 1 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5", label: "Yes" },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

export const integrations: Integration[] = [
  {
    id: "int-emr",
    name: "Aurora EMR",
    category: "Hospital systems",
    description: "Two-way sync of clinical encounters and patient demographics.",
    status: "connected",
    lastSync: at(0, "07:45"),
    icon: "🏥",
  },
  {
    id: "int-lab",
    name: "LabLink Diagnostics",
    category: "Hospital systems",
    description: "Pulls lab and imaging results into the patient timeline.",
    status: "connected",
    lastSync: at(0, "06:10"),
    icon: "🧪",
  },
  {
    id: "int-twilio",
    name: "Twilio SMS",
    category: "Communication",
    description: "Sends appointment reminders and campaign messages over SMS.",
    status: "connected",
    lastSync: at(0, "09:02"),
    icon: "💬",
  },
  {
    id: "int-whatsapp",
    name: "WhatsApp Business",
    category: "Communication",
    description: "Two-way patient messaging on WhatsApp.",
    status: "error",
    lastSync: at(-2, "18:40"),
    icon: "🟢",
  },
  {
    id: "int-sendgrid",
    name: "SendGrid Email",
    category: "Communication",
    description: "Transactional and campaign email delivery.",
    status: "connected",
    lastSync: at(0, "08:30"),
    icon: "✉️",
  },
  {
    id: "int-meta",
    name: "Meta Lead Ads",
    category: "Marketing",
    description: "Imports Facebook and Instagram lead forms into the pipeline.",
    status: "connected",
    lastSync: at(0, "05:20"),
    icon: "📣",
  },
  {
    id: "int-ga",
    name: "Google Analytics",
    category: "Marketing",
    description: "Attributes website enquiries to acquisition sources.",
    status: "pending",
    lastSync: null,
    icon: "📈",
  },
  {
    id: "int-stripe",
    name: "Stripe Payments",
    category: "Payments",
    description: "Collects deposits and package payments online.",
    status: "connected",
    lastSync: at(0, "08:55"),
    icon: "💳",
  },
  {
    id: "int-hmo",
    name: "MediCare Plus Portal",
    category: "Payments",
    description: "Verifies HMO eligibility and submits claims.",
    status: "disconnected",
    lastSync: null,
    icon: "🩺",
  },
  {
    id: "int-webhooks",
    name: "Webhooks & API",
    category: "Developer",
    description: "Streams CRM events to your own systems.",
    status: "connected",
    lastSync: at(-1, "22:15"),
    icon: "🔌",
  },
];

export const integrationById = (id: string) =>
  integrations.find((i) => i.id === id);
