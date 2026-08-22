import { z } from "zod";
import type { AppointmentStatus, LeadSource, LeadStage, Patient, PatientStatus, Priority } from "@/lib/types";

/**
 * plan/05-http-api.md §2. One schema per boundary, shared by the API and, in
 * Phase 06, by Server Actions — the plan's stack table calls that out as the
 * reason Zod is here at all.
 *
 * These validate *shape*, never permission. A well-formed request from a
 * caller who may not make it still reaches the service and is refused there.
 * Keeping the two apart is what stops a validation schema quietly becoming a
 * second, weaker copy of the authorisation matrix.
 *
 * Query parameters arrive as strings, so every numeric and boolean field
 * coerces. `z.coerce.number()` on `"abc"` yields NaN and fails the schema,
 * which is the 422 the plan wants rather than a silent default.
 */

/** Shared by every list endpoint. */
export const pageQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * A business reference — `PT-102938`, `AP-40871`. plan §3: "Addressed by
 * business reference, never by UUID."
 *
 * Constrained rather than accepted as any string, so a path parameter cannot
 * carry something shaped like an injection attempt into a service. Drizzle
 * parameterises regardless; this is the belt to that braces.
 */
export const reference = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Not a valid record reference.");

const uuid = z.string().uuid();

/* -------------------------------------------------------------------------- */
/* Patients                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every enum below is written out **and** checked against the union in
 * lib/types.ts by the satisfies clause, so a value invented here (or one
 * dropped there) is a compile error rather than a 422 nobody can explain.
 * z.enum needs a literal tuple, which is why the values are repeated rather
 * than derived.
 */
export const patientStatusEnum = z.enum(["active", "inactive", "new", "archived"] satisfies PatientStatus[]);

export const genderEnum = z.enum(["Female", "Male", "Other"] satisfies Patient["gender"][]);

export const sourceEnum = z.enum([
  "website",
  "facebook",
  "google",
  "phone",
  "walk-in",
  "referral",
  "partner",
  "insurance",
] satisfies LeadSource[]);

export const patientFiltersSchema = pageQuery.extend({
  search: z.string().trim().min(1).max(100).optional(),
  status: patientStatusEnum.optional(),
  departmentId: uuid.optional(),
  doctorId: uuid.optional(),
  includeArchived: z.coerce.boolean().optional(),
  sort: z.enum(["name", "lastVisit", "registeredAt"]).optional(),
});

export const patientPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: patientStatusEnum.optional(),
    departmentId: uuid.nullable().optional(),
    doctorId: uuid.nullable().optional(),
    insurance: z.string().max(200).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    nextAppointment: z.string().date().nullable().optional(),
  })
  // An empty patch is a caller mistake, not a no-op success: it usually means
  // a field name was misspelled and the whole change was silently dropped.
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one field to change.",
  });

/**
 * plan §5's reveal request. `reason` is optional and free text — it is
 * recorded, never parsed, and the audit entry is what gives it weight.
 */
export const revealSchema = z.object({
  field: z.enum(["phone", "email", "address", "dateOfBirth"]),
  reason: z.string().trim().max(500).optional(),
});

export const archiveSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

/** plan §5's creation form: name, phone, and date of birth are the only fields required to persist. */
export const newPatientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  dateOfBirth: z.string().date(),
  gender: genderEnum,
  phone: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(200).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  emergencyContact: z
    .object({
      name: z.string().trim().max(200),
      relation: z.string().trim().max(100),
      phone: z.string().trim().max(50),
    })
    .nullable()
    .optional(),
  preferredChannel: z.enum(["sms", "email", "whatsapp", "call"]).optional(),
  departmentId: uuid.nullable().optional(),
  /** A doctor's business reference, e.g. `dr-482913` — resolved to a UUID by the action. */
  doctorReference: reference.nullable().optional(),
  source: sourceEnum,
  insurance: z.string().trim().max(200).nullable().optional(),
  tags: z.array(z.string().trim().max(50)).max(20).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

/* -------------------------------------------------------------------------- */
/* Appointments                                                               */
/* -------------------------------------------------------------------------- */

export const appointmentStatusEnum = z.enum([
  "requested",
  "pending",
  "confirmed",
  "checked-in",
  "in-consultation",
  "completed",
  "cancelled",
  "rescheduled",
  "no-show",
] satisfies AppointmentStatus[]);

export const appointmentFiltersSchema = pageQuery.extend({
  from: z.string().datetime({ offset: true }).optional(),
  until: z.string().datetime({ offset: true }).optional(),
  doctorId: uuid.optional(),
  departmentId: uuid.optional(),
  status: appointmentStatusEnum.optional(),
});

export const newAppointmentSchema = z.object({
  patientReference: reference,
  doctorReference: reference,
  type: z.string().trim().min(1).max(100),
  // plan §3: "UTC on the wire." An offset is required rather than assumed,
  // because a bare local time is ambiguous and this books a real slot.
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(480),
  location: z.string().max(200).nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
});

export const appointmentPatchSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    location: z.string().max(200).nullable().optional(),
    status: appointmentStatusEnum.optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one field to change.",
  });

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

export const leadStageEnum = z.enum([
  "new",
  "contacted",
  "qualified",
  "booked",
  "visited",
  "converted",
] satisfies LeadStage[]);

export const leadFiltersSchema = pageQuery.extend({
  stage: leadStageEnum.optional(),
  departmentId: uuid.optional(),
  ownerId: uuid.optional(),
  priority: z.enum(["low", "medium", "high", "urgent"] satisfies Priority[]).optional(),
  includeConverted: z.coerce.boolean().optional(),
});

export const moveStageSchema = z.object({ stage: leadStageEnum });

export const convertSchema = z.object({ patientReference: reference });

export const followUpCompleteSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
});

export const followUpRescheduleSchema = z.object({
  dueDate: z.string().date(),
});

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

export const auditFiltersSchema = z.object({
  action: z.string().max(64).optional(),
  resourceType: z.string().max(64).optional(),
  resourceId: z.string().max(128).optional(),
  actorId: uuid.optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/* -------------------------------------------------------------------------- */
/* Me                                                                         */
/* -------------------------------------------------------------------------- */

export const preferencesPatchSchema = z
  .object({
    density: z.enum(["comfortable", "compact"]).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    railCollapsed: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one preference to change.",
  });
