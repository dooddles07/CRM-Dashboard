import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as appointments from "@/lib/server/services/appointments";
import * as patients from "@/lib/server/services/patients";
import * as directory from "@/lib/server/services/directory";
import { appointmentFiltersSchema } from "@/lib/server/api/schemas";
import { TableSkeleton } from "@/components/data/skeletons";
import { AppointmentsClient } from "./appointments-client";

/** Server shell, same shape as /patients — see that page.tsx for the pattern. */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const raw = await props.searchParams;
  const filters = appointmentFiltersSchema.parse(
    Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string")),
  );

  return (
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <AppointmentsData filters={filters} />
    </Suspense>
  );
}

async function AppointmentsData({
  filters,
}: {
  filters: ReturnType<typeof appointmentFiltersSchema.parse>;
}) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  // The board's scope tabs (today/upcoming/past) and saved filters run
  // client-side over one page of rows, same as /patients — so this asks for
  // the full board rather than the default 25.
  const [page, departmentList, doctorList, patientList] = await Promise.all([
    appointments.list(session, { ...filters, perPage: filters.perPage ?? 100 }),
    directory.listDepartments(session),
    directory.listDoctors(session, { perPage: 100 }),
    patients.list(session, { perPage: 100 }),
  ]);

  return (
    <AppointmentsClient
      rows={page.data}
      total={page.meta.total}
      departments={departmentList.map((d) => ({ id: d.id, name: d.name }))}
      doctors={doctorList.data.map((d) => ({ reference: d.reference, name: d.name }))}
      patients={patientList.data.map((p) => ({ reference: p.reference, name: p.name }))}
    />
  );
}
