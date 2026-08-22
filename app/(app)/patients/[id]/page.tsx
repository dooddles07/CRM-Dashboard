import { Suspense } from "react";
import { headers as nextHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireSession, resolveClientIp } from "@/lib/server/auth/session";
import * as patients from "@/lib/server/services/patients";
import * as patientRecord from "@/lib/server/services/patient-record";
import * as timeline from "@/lib/server/services/timeline";
import { reference as referenceSchema } from "@/lib/server/api/schemas";
import { NotFoundError } from "@/lib/server/services/errors";
import { RecordSkeleton } from "@/components/data/skeletons";
import { PatientRecordClient } from "./patient-client";

/**
 * plan/06-screen-migration.md §1, step 3 and §6 item 2 — the detail pattern
 * and the timeline, migrated second so everything after it copies this shape.
 */
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const { id } = await props.params;
  // A malformed reference (too short, bad characters) can never resolve to a
  // row, so it gets the same friendly not-found page a real-but-hidden one
  // does, rather than surfacing a ZodError as a generic, logged failure.
  const parsed = referenceSchema.safeParse(id);
  if (!parsed.success) notFound();
  const reference = parsed.data;

  return (
    <Suspense fallback={<RecordSkeleton />}>
      <PatientRecordData reference={reference} />
    </Suspense>
  );
}

async function PatientRecordData({ reference }: { reference: string }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  const headerList = await nextHeaders();
  const auditContext = {
    actorName: authed.staff.name,
    ipAddress: resolveClientIp(headerList),
    userAgent: headerList.get("user-agent"),
    sessionId: authed.session.id,
  };

  // Parallel, not sequential — plan §5's rule for any screen making more than
  // one service call. `patients.byReference` also writes the `viewed` audit
  // entry; `patientRecord.bundle` and `timeline.forPatient` are read-only.
  //
  // A thrown `NotFoundError` becomes `notFound()` rather than reaching
  // error.tsx: error.message is stripped to a generic string once it crosses
  // the server/client boundary (only `error.digest` survives), so a
  // not-found record can only be told apart from a real failure here, before
  // that boundary.
  let patient: patients.PatientDetailDTO;
  let record: patientRecord.PatientRecordBundle;
  let events: Awaited<ReturnType<typeof timeline.forPatient>>;
  try {
    [patient, record, events] = await Promise.all([
      patients.byReference(session, reference, auditContext),
      patientRecord.bundle(session, reference),
      timeline.forPatient(session, reference),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return <PatientRecordClient patient={patient} record={record} events={events} />;
}
