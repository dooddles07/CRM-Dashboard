import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as leads from "@/lib/server/services/leads";
import * as directory from "@/lib/server/services/directory";
import { leadFiltersSchema } from "@/lib/server/api/schemas";
import { TableSkeleton } from "@/components/data/skeletons";
import { LeadsClient } from "./leads-client";

/** Server shell, same shape as /appointments — see that page.tsx for the pattern. */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const raw = await props.searchParams;
  const filters = leadFiltersSchema.parse(
    Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string")),
  );

  return (
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <LeadsData filters={filters} />
    </Suspense>
  );
}

async function LeadsData({ filters }: { filters: ReturnType<typeof leadFiltersSchema.parse> }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  // The board and table both work over one page of rows, client-side — same
  // reason /appointments asks for the full board rather than the default 25.
  const [page, departmentList, ownerList] = await Promise.all([
    leads.list(session, { ...filters, includeConverted: true, perPage: filters.perPage ?? 100 }),
    directory.listDepartments(session),
    directory.listStaff(session, { perPage: 100 }),
  ]);

  return (
    <LeadsClient
      rows={page.data}
      total={page.meta.total}
      departments={departmentList.map((d) => ({ id: d.id, name: d.name }))}
      owners={ownerList.data.map((s) => ({ reference: s.reference, name: s.name }))}
    />
  );
}
