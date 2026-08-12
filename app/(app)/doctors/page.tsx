import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as directory from "@/lib/server/services/directory";
import { CardListSkeleton } from "@/components/data/skeletons";
import { DoctorsClient } from "./doctors-client";

export default function Page() {
  return (
    <Suspense fallback={<CardListSkeleton />}>
      <DoctorsData />
    </Suspense>
  );
}

async function DoctorsData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  // Ten doctors and six departments: bounded by what a hospital has, so one
  // page rather than a paginated collection (plan §2).
  const [doctors, departments] = await Promise.all([
    directory.listDoctors(authed.authz, { perPage: 100 }),
    directory.listDepartments(authed.authz),
  ]);

  return (
    <DoctorsClient
      doctors={doctors.data}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
