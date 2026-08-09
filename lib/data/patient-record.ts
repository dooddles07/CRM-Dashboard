import type { Conversation, Feedback, Referral, TimelineEvent } from "@/lib/types";
import { at, day } from "./constants";

export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  kind: "Consent" | "Referral letter" | "Insurance" | "Summary" | "Image";
  sizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
}

export const conversations: Conversation[] = [
  {
    id: "CV-901",
    patientId: "PT-102938",
    channel: "sms",
    subject: "Appointment reminders",
    unread: false,
    lastMessageAt: at(-1, "16:30"),
    assignedTo: "u-012",
    messages: [
      {
        id: "m-1",
        direction: "outbound",
        channel: "sms",
        body: "St. Aurora: your cardiology follow-up with Dr. Elena Cruz is tomorrow, 10 Aug at 09:00, Tower A Room 412. Reply C to confirm.",
        sentAt: at(-1, "16:30"),
        authorId: null,
      },
      {
        id: "m-2",
        direction: "inbound",
        channel: "sms",
        body: "C",
        sentAt: at(-1, "17:02"),
        authorId: null,
      },
      {
        id: "m-3",
        direction: "outbound",
        channel: "sms",
        body: "Confirmed, thank you. Please bring your blood pressure log.",
        sentAt: at(-1, "17:03"),
        authorId: null,
      },
      {
        id: "m-4",
        direction: "inbound",
        channel: "sms",
        body: "Will do. Is it ok if my husband comes with me?",
        sentAt: at(-1, "18:14"),
        authorId: null,
      },
      {
        id: "m-5",
        direction: "outbound",
        channel: "sms",
        body: "Of course. One companion is welcome in the consultation room.",
        sentAt: at(-1, "18:22"),
        authorId: "u-012",
      },
    ],
  },
  {
    id: "CV-902",
    patientId: "PT-102801",
    channel: "call",
    subject: "Diabetes review follow-up",
    unread: true,
    lastMessageAt: at(-3, "11:20"),
    assignedTo: "u-006",
    messages: [
      {
        id: "m-10",
        direction: "outbound",
        channel: "call",
        body: "Outbound call, no answer. 45 seconds, went to voicemail.",
        sentAt: at(-9, "10:05"),
        authorId: "u-006",
      },
      {
        id: "m-11",
        direction: "outbound",
        channel: "call",
        body: "Second attempt, no answer. Voicemail left asking for a callback.",
        sentAt: at(-3, "11:20"),
        authorId: "u-006",
      },
      {
        id: "m-12",
        direction: "outbound",
        channel: "sms",
        body: "Internal: try the evening window. Patient works day shifts.",
        sentAt: at(-3, "11:24"),
        authorId: "u-006",
        internal: true,
      },
    ],
  },
  {
    id: "CV-903",
    patientId: "PT-102877",
    channel: "email",
    subject: "First appointment confirmation",
    unread: true,
    lastMessageAt: at(-2, "09:41"),
    assignedTo: "u-002",
    messages: [
      {
        id: "m-20",
        direction: "inbound",
        channel: "email",
        body: "Hi, I booked online for tomorrow afternoon. Do I need to bring anything for a first dermatology visit?",
        sentAt: at(-2, "09:41"),
        authorId: null,
      },
    ],
  },
  {
    id: "CV-904",
    patientId: "PT-102198",
    channel: "email",
    subject: "Billing dispute - March invoice",
    unread: true,
    lastMessageAt: at(-2, "14:55"),
    assignedTo: "u-007",
    messages: [
      {
        id: "m-30",
        direction: "inbound",
        channel: "email",
        body: "I have now asked three times about the March invoice. I was charged for a consultation I did not attend. Nobody has come back to me.",
        sentAt: at(-2, "14:55"),
        authorId: null,
      },
    ],
  },
  {
    id: "CV-905",
    patientId: "PT-102764",
    channel: "whatsapp",
    subject: "Missed screening",
    unread: true,
    lastMessageAt: at(0, "11:32"),
    assignedTo: "u-002",
    messages: [
      {
        id: "m-40",
        direction: "outbound",
        channel: "whatsapp",
        body: "St. Aurora: we missed you at your 11:00 screening today. Would you like to rebook? Reply with a day that suits you.",
        sentAt: at(0, "11:32"),
        authorId: null,
      },
    ],
  },
];

export const conversationsFor = (patientId: string) =>
  conversations.filter((c) => c.patientId === patientId);

export const referrals: Referral[] = [
  {
    id: "RF-5501",
    patientName: "Maria Santos",
    provider: "Kaunlaran Family Clinic",
    providerType: "Clinic",
    departmentId: "cardiology",
    receivedAt: day(-26),
    status: "completed",
    ownerId: "u-012",
    outcome: "Angioplasty performed, patient retained",
    value: 148000,
  },
  {
    id: "RF-5502",
    patientName: "Beatriz Aguilar",
    provider: "Dr. Ramon Ilagan",
    providerType: "Physician",
    departmentId: "cardiology",
    receivedAt: day(-12),
    status: "visited",
    ownerId: "u-012",
    outcome: null,
    value: 42000,
  },
  {
    id: "RF-5503",
    patientName: "Enrique Salazar",
    provider: "San Juan District Hospital",
    providerType: "Hospital",
    departmentId: "orthopedics",
    receivedAt: day(-19),
    status: "scheduled",
    ownerId: "u-002",
    outcome: null,
    value: 96000,
  },
  {
    id: "RF-5504",
    patientName: "Rosa Fernandez",
    provider: "MediCare Plus",
    providerType: "Insurance",
    departmentId: "orthopedics",
    receivedAt: day(-6),
    status: "contacted",
    ownerId: "u-002",
    outcome: null,
    value: 31000,
  },
  {
    id: "RF-5505",
    patientName: "Noel Bautista",
    provider: "Kaunlaran Family Clinic",
    providerType: "Clinic",
    departmentId: "cardiology",
    receivedAt: day(-2),
    status: "assigned",
    ownerId: "u-012",
    outcome: null,
    value: 58000,
  },
  {
    id: "RF-5506",
    patientName: "Camille Torres",
    provider: "Dr. Alma Guevarra",
    providerType: "Physician",
    departmentId: "general-medicine",
    receivedAt: day(-1),
    status: "received",
    ownerId: "u-002",
    outcome: null,
    value: 18000,
  },
  {
    id: "RF-5507",
    patientName: "Teresa Villanueva",
    provider: "Pacific Cover",
    providerType: "Insurance",
    departmentId: "internal-medicine",
    receivedAt: day(-33),
    status: "declined",
    ownerId: "u-006",
    outcome: "Patient chose a facility closer to home",
    value: 0,
  },
];

export const referralsForPatient = (name: string) =>
  referrals.filter((r) => r.patientName === name);

export const feedback: Feedback[] = [
  {
    id: "FB-7701",
    patientId: "PT-102938",
    departmentId: "cardiology",
    doctorId: "dr-001",
    rating: 5,
    category: "Care quality",
    comment:
      "Dr. Cruz explained the procedure twice because I was anxious the first time. The nurses checked on me every hour afterwards.",
    submittedAt: at(-6, "19:12"),
    status: "reviewed",
  },
  {
    id: "FB-7702",
    patientId: "PT-102344",
    departmentId: "general-medicine",
    doctorId: "dr-006",
    rating: 2,
    category: "Wait time",
    comment:
      "Appointment was at 10:00, I was seen at 11:40. Nobody told me there was a delay until I asked.",
    submittedAt: at(-29, "13:05"),
    status: "actioned",
  },
  {
    id: "FB-7703",
    patientId: "PT-102790",
    departmentId: "pediatrics",
    doctorId: "dr-002",
    rating: 5,
    category: "Staff",
    comment: "The team is wonderful with my daughter. She is not frightened of appointments anymore.",
    submittedAt: at(-6, "10:44"),
    status: "reviewed",
  },
  {
    id: "FB-7704",
    patientId: "PT-102198",
    departmentId: "internal-medicine",
    doctorId: "dr-009",
    rating: 1,
    category: "Billing",
    comment: "Charged for a consultation I did not attend. Three emails, no reply.",
    submittedAt: at(-8, "08:30"),
    status: "new",
  },
  {
    id: "FB-7705",
    patientId: "PT-102698",
    departmentId: "dermatology",
    doctorId: "dr-003",
    rating: 5,
    category: "Care quality",
    comment: "Straightforward, no upselling. Treatment worked.",
    submittedAt: at(-16, "17:20"),
    status: "reviewed",
  },
  {
    id: "FB-7706",
    patientId: "PT-102712",
    departmentId: "cardiology",
    doctorId: "dr-007",
    rating: 4,
    category: "Facilities",
    comment: "Good care. The waiting area on the fourth floor is very cold.",
    submittedAt: at(-3, "12:15"),
    status: "new",
  },
  {
    id: "FB-7707",
    patientId: "PT-102601",
    departmentId: "orthopedics",
    doctorId: "dr-010",
    rating: 3,
    category: "Care quality",
    comment: "The consultation was fine but the cost was never explained before the scan was ordered.",
    submittedAt: at(-58, "16:02"),
    status: "actioned",
  },
];

export const feedbackFor = (patientId: string) =>
  feedback.filter((f) => f.patientId === patientId);

export const documents: PatientDocument[] = [
  {
    id: "DOC-201",
    patientId: "PT-102938",
    name: "Procedure consent - angioplasty.pdf",
    kind: "Consent",
    sizeKb: 284,
    uploadedAt: at(-9, "07:10"),
    uploadedBy: "Paolo Tan",
  },
  {
    id: "DOC-202",
    patientId: "PT-102938",
    name: "Referral letter - Kaunlaran Family Clinic.pdf",
    kind: "Referral letter",
    sizeKb: 156,
    uploadedAt: at(-26, "09:22"),
    uploadedBy: "Rowena Aquino",
  },
  {
    id: "DOC-203",
    patientId: "PT-102938",
    name: "MediCare Plus - coverage confirmation.pdf",
    kind: "Insurance",
    sizeKb: 98,
    uploadedAt: at(-24, "14:40"),
    uploadedBy: "Arnel Pascual",
  },
  {
    id: "DOC-204",
    patientId: "PT-102938",
    name: "Discharge summary - 01 Aug.pdf",
    kind: "Summary",
    sizeKb: 342,
    uploadedAt: at(-9, "16:55"),
    uploadedBy: "Liza Fernandez",
  },
  {
    id: "DOC-210",
    patientId: "PT-102914",
    name: "Physiotherapy plan - partner clinic.pdf",
    kind: "Summary",
    sizeKb: 211,
    uploadedAt: at(-12, "11:02"),
    uploadedBy: "Celine Marquez",
  },
];

export const documentsFor = (patientId: string) =>
  documents.filter((d) => d.patientId === patientId);

export interface PatientNote {
  id: string;
  patientId: string;
  body: string;
  author: string;
  createdAt: string;
  pinned?: boolean;
}

export const notes: PatientNote[] = [
  {
    id: "NT-401",
    patientId: "PT-102938",
    body: "Prefers morning slots. Husband usually accompanies and handles the paperwork. Do not schedule after 14:00 without asking first.",
    author: "Sandra Chua",
    createdAt: at(-23, "11:15"),
    pinned: true,
  },
  {
    id: "NT-402",
    patientId: "PT-102938",
    body: "Anxious about procedures. Dr. Cruz walked through the angiogram twice before consent. Worth repeating for any future intervention.",
    author: "Liza Fernandez",
    createdAt: at(-9, "07:30"),
  },
  {
    id: "NT-403",
    patientId: "PT-102938",
    body: "Blood pressure log is being kept on paper. Offered the app, patient declined. Reception to photograph the log at each visit.",
    author: "Paolo Tan",
    createdAt: at(0, "09:35"),
  },
  {
    id: "NT-410",
    patientId: "PT-102801",
    body: "Works day shifts. Both follow-up calls were placed mid-morning and went unanswered. Try after 18:00.",
    author: "Liza Fernandez",
    createdAt: at(-3, "11:24"),
    pinned: true,
  },
  {
    id: "NT-411",
    patientId: "PT-102198",
    body: "Open billing complaint. Excluded from all campaigns until the case is closed.",
    author: "Isabel Domingo",
    createdAt: at(-8, "09:10"),
    pinned: true,
  },
];

export const notesFor = (patientId: string) =>
  notes.filter((n) => n.patientId === patientId);

/** Events that are not derivable from another record. */
export const extraTimeline: TimelineEvent[] = [
  {
    id: "tl-x1",
    subjectId: "PT-102938",
    kind: "workflow",
    title: "Post-procedure care sequence started",
    detail: "Day 3 and day 9 checks scheduled automatically",
    at: at(-9, "17:00"),
    actor: "Automation",
    tone: "ai",
  },
  {
    id: "tl-x2",
    subjectId: "PT-102938",
    kind: "record",
    title: "Contact number updated",
    detail: "Mobile changed from ••••8812 to ••••8890",
    at: at(0, "10:42"),
    actor: "Paolo Tan",
    tone: "neutral",
  },
  {
    id: "tl-x3",
    subjectId: "PT-102938",
    kind: "record",
    title: "Patient registered",
    detail: "Created from a referral by Kaunlaran Family Clinic",
    at: at(-26, "09:22"),
    actor: "Rowena Aquino",
    tone: "info",
  },
  {
    id: "tl-x4",
    subjectId: "PT-102801",
    kind: "record",
    title: "Patient registered",
    detail: "Walk-in registration at the outpatient desk",
    at: at(-421, "08:40"),
    actor: "Reception",
    tone: "info",
  },
];
