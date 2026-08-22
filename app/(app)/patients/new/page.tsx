import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as directory from "@/lib/server/services/directory";
import { CardListSkeleton } from "@/components/data/skeletons";
import { NewPatientClient } from "./new-patient-client";

/**
 * plan/06-screen-migration.md §5: "the largest file and needs the least
 * data. It is a form; only the department and doctor lists come from the
 * server."
 */
export default async function Page() {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  return (
    <Suspense fallback={<CardListSkeleton count={3} />}>
      <NewPatientData />
    </Suspense>
  );
}

async function NewPatientData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  const [departmentList, doctorList] = await Promise.all([
    directory.listDepartments(session),
    directory.listDoctors(session, { perPage: 100 }),
  ]);

  return (
    <NewPatientClient
      departments={departmentList.map((d) => ({ id: d.id, name: d.name }))}
      doctors={doctorList.data.map((d) => ({
        reference: d.reference,
        name: d.name,
        specialty: d.specialty,
        departmentId: d.department?.id ?? null,
      }))}
    />
  );
}
