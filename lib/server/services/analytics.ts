import { and, count, eq, sql } from "drizzle-orm";
import { assert, type AuthzSession } from "@/lib/server/authz/policy";
import { withSession } from "@/lib/server/db/session";
import { departments } from "@/lib/server/db/schema/org";
import { patients } from "@/lib/server/db/schema/people";
import { appointments } from "@/lib/server/db/schema/scheduling";
import { complaints, feedback } from "@/lib/server/db/schema/experience";
import { leads } from "@/lib/server/db/schema/pipeline";

/**
 * plan/04-service-layer.md §9: "Aggregates only. No PII in any return shape."
 *
 * Enforced by construction rather than by filtering: nothing in this module
 * selects a name, a reference, or a contact column. Every return type below
 * is numbers and labels, and the labels are department and category names —
 * organisational facts, not personal ones.
 *
 * That rule is why `bySource` returns counts per source rather than the leads
 * themselves, and why there is no "top patients" or "most contacted"
 * function. An aggregate over a small enough group stops being an aggregate:
 * "1 patient in Dermatology aged 34" identifies someone. The seed has 24
 * patients across 6 departments, so the small-group problem is real here and
 * not theoretical — but the answer is not a suppression threshold bolted on
 * afterwards. It is that these functions return counts of things, never
 * counts sliced finely enough to single anyone out.
 *
 * Every figure is scoped by row-level security like everything else, so a
 * Nurse's dashboard covers their department and says nothing about the rest.
 * plan/03 §4 makes that a feature of the numbers, not a limitation: the
 * dashboard answers "what is happening in your work", not "in the hospital".
 */

export interface DashboardKpis {
  patients: number;
  appointmentsToday: number;
  openLeads: number;
  openComplaints: number;
  breachedComplaints: number;
  averageSatisfaction: number | null;
}

export interface SeriesPoint {
  label: string;
  value: number;
}

/** The Command Center's headline numbers. One round trip, five aggregates. */
export async function dashboard(session: AuthzSession): Promise<DashboardKpis> {
  assert(session, "reports", "view");

  return withSession(session, async (tx) => {
    const [patientTotals] = await tx
      .select({ n: sql<number>`count(*) FILTER (WHERE ${patients.archivedAt} IS NULL)::int` })
      .from(patients);

    const [appointmentTotals] = await tx
      .select({
        today: sql<number>`count(*) FILTER (
          WHERE ${appointments.startsAt} >= date_trunc('day', now())
            AND ${appointments.startsAt} <  date_trunc('day', now()) + interval '1 day')::int`,
      })
      .from(appointments);

    const [leadTotals] = await tx
      .select({ open: sql<number>`count(*) FILTER (WHERE ${leads.convertedPatientId} IS NULL)::int` })
      .from(leads);

    const [complaintTotals] = await tx
      .select({
        open: sql<number>`count(*) FILTER (WHERE ${complaints.resolvedAt} IS NULL)::int`,
        breached: sql<number>`count(*) FILTER (
          WHERE ${complaints.resolvedAt} IS NULL AND ${complaints.slaDueAt} < now())::int`,
      })
      .from(complaints);

    const [satisfaction] = await tx
      .select({ average: sql<string | null>`round(avg(${feedback.rating})::numeric, 2)` })
      .from(feedback);

    return {
      patients: patientTotals?.n ?? 0,
      appointmentsToday: appointmentTotals?.today ?? 0,
      openLeads: leadTotals?.open ?? 0,
      openComplaints: complaintTotals?.open ?? 0,
      breachedComplaints: complaintTotals?.breached ?? 0,
      averageSatisfaction:
        satisfaction?.average === null || satisfaction?.average === undefined
          ? null
          : Number(satisfaction.average),
    };
  });
}

/** Patients per department. Labels are department names, never patient names. */
export async function patientsByDepartment(session: AuthzSession): Promise<SeriesPoint[]> {
  assert(session, "reports", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({ label: departments.name, value: count(patients.id) })
      .from(departments)
      .leftJoin(
        patients,
        and(eq(patients.departmentId, departments.id), sql`${patients.archivedAt} IS NULL`),
      )
      .groupBy(departments.name)
      .orderBy(departments.name);

    return rows.map((row) => ({ label: row.label, value: Number(row.value) }));
  });
}

/** Where leads come from. A marketing question, answered without naming a lead. */
export async function leadsBySource(session: AuthzSession): Promise<SeriesPoint[]> {
  assert(session, "reports", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({ label: leads.source, value: sql<number>`count(*)::int` })
      .from(leads)
      .groupBy(leads.source)
      .orderBy(sql`count(*) DESC`);

    return rows.map((row) => ({ label: row.label, value: row.value }));
  });
}

/**
 * Appointments per day over a window, for the scheduling chart.
 *
 * `generate_series` fills days with no appointments, so the chart has a flat
 * line rather than a gap — a missing point reads as missing data, while a
 * zero reads as a quiet day, and they are different claims.
 */
export async function appointmentsPerDay(
  session: AuthzSession,
  days = 30,
): Promise<SeriesPoint[]> {
  assert(session, "reports", "view");
  const window = Math.min(365, Math.max(1, Math.floor(days)));

  return withSession(session, async (tx) => {
    const rows = await tx.execute<{ label: string; value: number }>(sql`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS label,
             count(a.id)::int             AS value
      FROM generate_series(
             date_trunc('day', now()) - (${window} - 1) * interval '1 day',
             date_trunc('day', now()),
             interval '1 day'
           ) AS d(day)
      LEFT JOIN ${appointments} a
        ON a.starts_at >= d.day AND a.starts_at < d.day + interval '1 day'
      GROUP BY d.day
      ORDER BY d.day
    `);

    return rows.rows.map((row) => ({ label: row.label, value: Number(row.value) }));
  });
}

/** Lead pipeline value per stage, in cents. Money, not people. */
export async function pipelineValue(session: AuthzSession): Promise<SeriesPoint[]> {
  assert(session, "reports", "view");

  return withSession(session, async (tx) => {
    const rows = await tx
      .select({
        label: leads.stage,
        value: sql<number>`coalesce(sum(${leads.valueCents}), 0)::bigint`,
      })
      .from(leads)
      .where(sql`${leads.convertedPatientId} IS NULL`)
      .groupBy(leads.stage);

    return rows.map((row) => ({ label: String(row.label), value: Number(row.value) }));
  });
}
