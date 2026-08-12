import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as directory from "@/lib/server/services/directory";
import { TableSkeleton } from "@/components/data/skeletons";
import { StaffClient } from "./staff-client";

/**
 * The directory is readable by every authenticated role — plan/03 §5.2 — so
 * this shell has no area assertion beyond the session itself.
 */
export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton rows={10} columns={5} />}>
      <StaffData />
    </Suspense>
  );
}

async function StaffData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  // The hospital has twelve staff, so this is one page, not a paginated
  // collection. plan §2: paginating something bounded by how many a hospital
  // has adds latency for nothing.
  const page = await directory.listStaff(authed.authz, { perPage: 100 });
  const activeCount = page.data.filter((s) => s.status === "active").length;

  return <StaffClient rows={page.data} activeCount={activeCount} />;
}
