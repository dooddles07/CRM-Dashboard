import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as followups from "@/lib/server/services/followups";
import * as patients from "@/lib/server/services/patients";
import * as directory from "@/lib/server/services/directory";
import { pageQuery } from "@/lib/server/api/schemas";
import { TableSkeleton } from "@/components/data/skeletons";
import { FollowUpsClient } from "./follow-ups-client";

/** Server shell, same shape as /appointments — see that page.tsx for the pattern. */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const raw = await props.searchParams;
  const filters = pageQuery.parse(
    Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string")),
  );

  return (
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <FollowUpsData filters={filters} />
    </Suspense>
  );
}

async function FollowUpsData({ filters }: { filters: ReturnType<typeof pageQuery.parse> }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  // The view tabs (overdue/today/upcoming/completed) run client-side over
  // one page, same as /appointments' scope tabs.
  const [page, patientList, ownerList] = await Promise.all([
    followups.list(session, { ...filters, perPage: filters.perPage ?? 100 }),
    patients.list(session, { perPage: 100 }),
    directory.listStaff(session, { perPage: 100 }),
  ]);

  return (
    <FollowUpsClient
      rows={page.data}
      total={page.meta.total}
      patients={patientList.data.map((p) => ({ reference: p.reference, name: p.name }))}
      owners={ownerList.data.map((s) => ({ reference: s.reference, name: s.name }))}
    />
  );
}
