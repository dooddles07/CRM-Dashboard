import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as appointments from "@/lib/server/services/appointments";
import { reference as referenceSchema } from "@/lib/server/api/schemas";
import { NotFoundError } from "@/lib/server/services/errors";
import { RecordSkeleton } from "@/components/data/skeletons";
import { AppointmentRecordClient } from "./appointment-client";

/** Same detail-page pattern as /patients/[id]/page.tsx. */
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const { id } = await props.params;
  const parsed = referenceSchema.safeParse(id);
  if (!parsed.success) notFound();

  return (
    <Suspense fallback={<RecordSkeleton />}>
      <AppointmentRecordData reference={parsed.data} />
    </Suspense>
  );
}

async function AppointmentRecordData({ reference }: { reference: string }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  let appointment: appointments.AppointmentDTO;
  try {
    appointment = await appointments.byReference(session, reference);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return <AppointmentRecordClient appointment={appointment} />;
}
