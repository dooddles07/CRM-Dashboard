import type { LeadSource } from "@/lib/types";

/**
 * Static UI vocabulary, not seed data — split out of lib/data/constants.ts so
 * the migrated patient screens (plan/06-screen-migration.md) can use these
 * labels without importing anything from lib/data/.
 */
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

export const patientTagOptions = [
  "VIP",
  "High priority",
  "Follow-up required",
  "New patient",
  "Returning patient",
  "Chronic care",
  "Insurance pending",
  "Interpreter needed",
] as const;
