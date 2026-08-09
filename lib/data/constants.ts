import type { Department, DepartmentId, LeadSource, StaffRole } from "@/lib/types";

/**
 * The demo clock. Every fixture date is derived from this so the build renders
 * identically on any day. Monday, a normal operating day.
 */
export const TODAY = "2026-08-10";

export const HOSPITAL = {
  name: "St. Aurora Medical Center",
  shortName: "St. Aurora",
  beds: 320,
  city: "Quezon City",
  timezone: "Asia/Manila (GMT+8)",
} as const;

export const CURRENT_USER = {
  id: "u-001",
  name: "Isabel Domingo",
  initials: "ID",
  role: "Hospital Admin" as StaffRole,
  email: "i.domingo@staurora.example",
  online: true,
};

export const departments: Department[] = [
  {
    id: "cardiology",
    name: "Cardiology",
    head: "Dr. Elena Cruz",
    patients: 2148,
    appointments: 412,
    doctors: 7,
    leads: 96,
    noShowRate: 6.4,
    satisfaction: 4.7,
    growth: 8.2,
    floor: "Tower A · 4F",
  },
  {
    id: "pediatrics",
    name: "Pediatrics",
    head: "Dr. Miguel Santos",
    patients: 3104,
    appointments: 588,
    doctors: 9,
    leads: 141,
    noShowRate: 11.8,
    satisfaction: 4.5,
    growth: 12.6,
    floor: "Tower B · 2F",
  },
  {
    id: "internal-medicine",
    name: "Internal Medicine",
    head: "Dr. Rafael Lim",
    patients: 4392,
    appointments: 731,
    doctors: 12,
    leads: 118,
    noShowRate: 7.1,
    satisfaction: 4.6,
    growth: 4.9,
    floor: "Tower A · 3F",
  },
  {
    id: "orthopedics",
    name: "Orthopedics",
    head: "Dr. Carlos Mendoza",
    patients: 1876,
    appointments: 344,
    doctors: 6,
    leads: 74,
    noShowRate: 8.9,
    satisfaction: 4.4,
    growth: 6.1,
    floor: "Tower B · 5F",
  },
  {
    id: "dermatology",
    name: "Dermatology",
    head: "Dr. Andrea Reyes",
    patients: 1503,
    appointments: 296,
    doctors: 5,
    leads: 187,
    noShowRate: 5.2,
    satisfaction: 4.8,
    growth: 15.3,
    floor: "Tower A · 2F",
  },
  {
    id: "general-medicine",
    name: "General Medicine",
    head: "Dr. Patricia Yu",
    patients: 5218,
    appointments: 902,
    doctors: 14,
    leads: 203,
    noShowRate: 9.4,
    satisfaction: 4.3,
    growth: 3.4,
    floor: "Ground · Outpatient",
  },
];

export const departmentName = (id: DepartmentId) =>
  departments.find((d) => d.id === id)?.name ?? "Unassigned";

export const sourceLabels: Record<LeadSource, string> = {
  website: "Website",
  facebook: "Facebook",
  google: "Google",
  phone: "Phone",
  "walk-in": "Walk-in",
  referral: "Referral",
  partner: "Partner",
  insurance: "Insurance",
};

export const patientTags = [
  "VIP",
  "High priority",
  "Follow-up required",
  "New patient",
  "Returning patient",
  "Chronic care",
  "Insurance pending",
  "Interpreter needed",
] as const;

export const insurers = [
  "MediCare Plus",
  "AsiaHealth",
  "Pacific Cover",
  "Unity Benefits",
  null,
] as const;

/** Offset days from the demo clock, returned as an ISO date. */
export function day(offset: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Offset from the demo clock at a wall-clock time, as a full ISO timestamp. */
export function at(offsetDays: number, time: string): string {
  return `${day(offsetDays)}T${time}:00`;
}
