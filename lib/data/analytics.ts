import type { AiInsight, KpiDatum } from "@/lib/types";

/** Demonstration metrics. Fictional, internally consistent, not benchmarks. */

export const kpis: KpiDatum[] = [
  {
    id: "total-patients",
    label: "Total patients",
    value: "18,241",
    raw: 18241,
    change: 3.1,
    comparison: "vs last month",
    context: "412 registered in the last 30 days",
    tone: "info",
    series: [16890, 17020, 17180, 17330, 17490, 17610, 17780, 17920, 18040, 18120, 18190, 18241],
    href: "/patients",
  },
  {
    id: "new-patients",
    label: "New patients",
    value: "1,284",
    raw: 1284,
    change: 12.8,
    comparison: "vs previous month",
    context: "Dermatology drove 31% of the increase",
    tone: "success",
    series: [880, 905, 962, 1010, 988, 1044, 1096, 1112, 1150, 1198, 1224, 1284],
    href: "/patients?filter=new",
  },
  {
    id: "appointments-today",
    label: "Appointments today",
    value: "14",
    raw: 14,
    change: 7.7,
    comparison: "vs last Monday",
    context: "2 still awaiting confirmation",
    tone: "info",
    series: [11, 13, 12, 15, 13, 12, 14],
    href: "/appointments",
  },
  {
    id: "completed",
    label: "Completed today",
    value: "2",
    raw: 2,
    change: -18.2,
    comparison: "vs this time last Monday",
    context: "9 still to run before 17:00",
    tone: "neutral",
    series: [4, 5, 3, 6, 4, 3, 2],
    href: "/appointments?status=completed",
  },
  {
    id: "no-shows",
    label: "No-shows",
    value: "1",
    raw: 1,
    change: -33.3,
    comparison: "vs last Monday",
    context: "8.4% rate across the last 30 days",
    tone: "success",
    series: [3, 2, 4, 2, 3, 2, 1],
    href: "/appointments?status=no-show",
    invertTrend: true,
  },
  {
    id: "follow-ups",
    label: "Pending follow-ups",
    value: "11",
    raw: 11,
    change: 22.2,
    comparison: "vs last week",
    context: "5 are already overdue",
    tone: "warning",
    series: [7, 8, 6, 9, 8, 9, 11],
    href: "/follow-ups",
    invertTrend: true,
  },
  {
    id: "new-leads",
    label: "New leads",
    value: "12",
    raw: 12,
    change: 41.2,
    comparison: "vs yesterday",
    context: "None assigned yet",
    tone: "info",
    series: [6, 9, 7, 11, 8, 10, 12],
    href: "/leads",
  },
  {
    id: "satisfaction",
    label: "Patient satisfaction",
    value: "4.6",
    raw: 4.6,
    change: 2.2,
    comparison: "vs last quarter",
    context: "1,842 responses · 61% response rate",
    tone: "success",
    series: [4.3, 4.35, 4.4, 4.38, 4.45, 4.5, 4.48, 4.52, 4.55, 4.57, 4.58, 4.6],
    href: "/feedback",
  },
];

export const patientGrowth = [
  { month: "Sep", newPatients: 880, returning: 2140 },
  { month: "Oct", newPatients: 905, returning: 2215 },
  { month: "Nov", newPatients: 962, returning: 2180 },
  { month: "Dec", newPatients: 1010, returning: 2402 },
  { month: "Jan", newPatients: 988, returning: 2338 },
  { month: "Feb", newPatients: 1044, returning: 2451 },
  { month: "Mar", newPatients: 1096, returning: 2510 },
  { month: "Apr", newPatients: 1112, returning: 2488 },
  { month: "May", newPatients: 1150, returning: 2604 },
  { month: "Jun", newPatients: 1198, returning: 2671 },
  { month: "Jul", newPatients: 1224, returning: 2718 },
  { month: "Aug", newPatients: 1284, returning: 2796 },
];

export const appointmentOverview = [
  { day: "Mon", completed: 186, scheduled: 24, cancelled: 11, noShow: 17 },
  { day: "Tue", completed: 204, scheduled: 19, cancelled: 14, noShow: 21 },
  { day: "Wed", completed: 171, scheduled: 22, cancelled: 9, noShow: 15 },
  { day: "Thu", completed: 212, scheduled: 26, cancelled: 13, noShow: 19 },
  { day: "Fri", completed: 198, scheduled: 31, cancelled: 16, noShow: 22 },
  { day: "Sat", completed: 96, scheduled: 12, cancelled: 6, noShow: 9 },
  { day: "Sun", completed: 41, scheduled: 5, cancelled: 3, noShow: 4 },
];

export const departmentDistribution = [
  { department: "General Medicine", patients: 5218, fill: "var(--color-chart-1)" },
  { department: "Internal Medicine", patients: 4392, fill: "var(--color-chart-2)" },
  { department: "Pediatrics", patients: 3104, fill: "var(--color-chart-3)" },
  { department: "Cardiology", patients: 2148, fill: "var(--color-chart-4)" },
  { department: "Orthopedics", patients: 1876, fill: "var(--color-chart-5)" },
  { department: "Dermatology", patients: 1503, fill: "var(--color-chart-6)" },
];

export const leadFunnel = [
  { stage: "New inquiry", count: 1284 },
  { stage: "Contacted", count: 936 },
  { stage: "Interested", count: 682 },
  { stage: "Appointment", count: 492 },
  { stage: "Visited", count: 421 },
  { stage: "Converted", count: 387 },
];

export const acquisitionSources = [
  { source: "Website", leads: 386, converted: 142 },
  { source: "Referral", leads: 271, converted: 118 },
  { source: "Google", leads: 244, converted: 71 },
  { source: "Facebook", leads: 198, converted: 39 },
  { source: "Walk-in", leads: 96, converted: 62 },
  { source: "Phone", leads: 61, converted: 24 },
  { source: "Insurance", leads: 28, converted: 12 },
];

export const satisfaction = {
  score: 4.6,
  scoreChange: 2.2,
  nps: 48,
  npsChange: 6,
  responses: 1842,
  responseRate: 61,
  positive: 1512,
  neutral: 218,
  negative: 112,
  openComplaints: 2,
  trend: [
    { month: "Mar", score: 4.4, nps: 39 },
    { month: "Apr", score: 4.45, nps: 41 },
    { month: "May", score: 4.5, nps: 44 },
    { month: "Jun", score: 4.52, nps: 45 },
    { month: "Jul", score: 4.55, nps: 46 },
    { month: "Aug", score: 4.6, nps: 48 },
  ],
};

export const aiInsights: AiInsight[] = [
  {
    id: "ai-1",
    headline: "Pediatrics no-show rate is the highest in the hospital",
    explanation:
      "11.8% over 30 days against an 8% threshold. Reminders for Pediatrics send 24 hours ahead; departments below 7% send at 48 and 4 hours.",
    metric: "11.8%",
    metricLabel: "no-show rate",
    direction: "up",
    action: { label: "Review reminder rules", href: "/settings" },
  },
  {
    id: "ai-2",
    headline: "27 patients have follow-ups nobody has actioned",
    explanation:
      "Five are past due, and two of those belong to patients with an open complaint. Contacting a complainant with a routine follow-up tends to make the case worse.",
    metric: "27",
    metricLabel: "outstanding",
    direction: "up",
    action: { label: "Open follow-ups", href: "/follow-ups" },
  },
  {
    id: "ai-3",
    headline: "Website leads convert 18% better than social leads",
    explanation:
      "Website leads reach a booked appointment 36.8% of the time against 19.7% from Facebook, on a comparable volume of enquiries this month.",
    metric: "+18%",
    metricLabel: "relative conversion",
    direction: "up",
    action: { label: "See lead sources", href: "/analytics" },
  },
  {
    id: "ai-4",
    headline: "Dermatology is growing faster than its capacity",
    explanation:
      "15.3% patient growth against five doctors and the lowest no-show rate at 5.2%. Slots after 15:00 are fully booked nine days out.",
    metric: "15.3%",
    metricLabel: "growth",
    direction: "up",
    action: { label: "Open department", href: "/departments" },
  },
];

export const alerts = [
  {
    id: "al-1",
    tone: "danger" as const,
    label: "5 overdue follow-ups",
    detail: "Oldest is 9 days past due",
    href: "/follow-ups",
  },
  {
    id: "al-2",
    tone: "warning" as const,
    label: "3 missed appointments",
    detail: "Yesterday · Pediatrics 2, Orthopedics 1",
    href: "/appointments?status=no-show",
  },
  {
    id: "al-3",
    tone: "danger" as const,
    label: "2 unresolved complaints",
    detail: "CS-2041 has breached its SLA",
    href: "/complaints",
  },
  {
    id: "al-4",
    tone: "warning" as const,
    label: "1 workflow failure",
    detail: "Post-visit feedback stopped after 3 send errors",
    href: "/automations",
  },
];
