import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as patients from "@/lib/server/services/patients";
import * as directory from "@/lib/server/services/directory";
import { patientFiltersSchema } from "@/lib/server/api/schemas";
import { TableSkeleton } from "@/components/data/skeletons";
import { PatientsClient } from "./patients-client";

/**
 * plan/06-screen-migration.md §1, step 3. The server shell.
 *
 * "Shells are short. If one grows past about forty lines it is doing work
 * that belongs in a service."
 *
 * Three things happen here and nothing else: resolve the caller, parse the
 * URL, call the services. The row-level scope is not mentioned anywhere —
 * `patients.list` runs inside `withSession`, so a Nurse gets their
 * department's rows because Postgres says so, not because this file asked.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authed = await requireSession();
  // The layout redirects too; this repeats it because a page must not depend
  // on a layout having run for its authorisation.
  if (!authed) redirect("/login");

  // `await props.searchParams` — Next 16 makes params and searchParams
  // Promises, and synchronous access is removed.
  const raw = await props.searchParams;
  const filters = patientFiltersSchema.parse(
    Object.fromEntries(
      Object.entries(raw).filter(([, value]) => typeof value === "string"),
    ),
  );

  return (
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <PatientsData filters={filters} />
    </Suspense>
  );
}

/**
 * Split from the page so the Suspense boundary has something to suspend on.
 * Without it the fallback never renders — the page itself would await before
 * returning any UI.
 */
async function PatientsData({
  filters,
}: {
  filters: ReturnType<typeof patientFiltersSchema.parse>;
}) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  // Parallel, not sequential: three round trips one after another is three
  // times the latency for no reason. plan §5 makes the same point about the
  // Command Centre's five calls.
  const [page, departmentList, doctorList] = await Promise.all([
    patients.list(session, filters),
    directory.listDepartments(session),
    directory.listDoctors(session, { perPage: 100 }),
  ]);

  return (
    <PatientsClient
      rows={page.data}
      total={page.meta.total}
      departments={departmentList.map((d) => ({ id: d.id, name: d.name }))}
      doctors={doctorList.data.map((d) => ({ reference: d.reference, name: d.name }))}
    />
  );
}
