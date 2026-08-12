import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as directory from "@/lib/server/services/directory";
import { CardListSkeleton } from "@/components/data/skeletons";
import { DepartmentsClient } from "./departments-client";

export default function Page() {
  return (
    <Suspense fallback={<CardListSkeleton />}>
      <DepartmentsData />
    </Suspense>
  );
}

async function DepartmentsData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  // Rollups are computed live and inherit row-level security, so a
  // department-scoped caller sees their own numbers and zeroes elsewhere.
  const departments = await directory.listDepartments(authed.authz);
  return <DepartmentsClient departments={departments} />;
}
