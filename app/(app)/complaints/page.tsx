import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as complaints from "@/lib/server/services/complaints";
import * as directory from "@/lib/server/services/directory";
import { complaintFiltersSchema } from "@/lib/server/api/schemas";
import { TableSkeleton } from "@/components/data/skeletons";
import { ComplaintsClient } from "./complaints-client";

/** Server shell, same shape as /leads — see that page.tsx for the pattern. */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const raw = await props.searchParams;
  const filters = complaintFiltersSchema.parse(
    Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string")),
  );

  return (
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <ComplaintsData filters={filters} />
    </Suspense>
  );
}

async function ComplaintsData({
  filters,
}: {
  filters: ReturnType<typeof complaintFiltersSchema.parse>;
}) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  const [page, summary, departmentList, ownerList] = await Promise.all([
    complaints.list(session, { ...filters, perPage: filters.perPage ?? 100 }),
    complaints.summary(session),
    directory.listDepartments(session),
    directory.listStaff(session, { perPage: 100 }),
  ]);

  return (
    <ComplaintsClient
      rows={page.data}
      total={page.meta.total}
      summary={summary}
      departments={departmentList.map((d) => ({ id: d.id, name: d.name }))}
      owners={ownerList.data.map((s) => ({ reference: s.reference, name: s.name }))}
    />
  );
}
