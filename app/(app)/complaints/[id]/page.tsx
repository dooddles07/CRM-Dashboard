import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as complaints from "@/lib/server/services/complaints";
import * as directory from "@/lib/server/services/directory";
import { reference as referenceSchema } from "@/lib/server/api/schemas";
import { NotFoundError } from "@/lib/server/services/errors";
import { RecordSkeleton } from "@/components/data/skeletons";
import { ComplaintRecordClient } from "./complaint-client";

/** Same detail-page pattern as /leads/[id]/page.tsx. */
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const { id } = await props.params;
  const parsed = referenceSchema.safeParse(id);
  if (!parsed.success) notFound();

  return (
    <Suspense fallback={<RecordSkeleton />}>
      <ComplaintRecordData reference={parsed.data} />
    </Suspense>
  );
}

async function ComplaintRecordData({ reference }: { reference: string }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  let complaint: complaints.ComplaintDTO;
  try {
    complaint = await complaints.byReference(session, reference);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const ownerList = await directory.listStaff(session, { perPage: 100 });

  return (
    <ComplaintRecordClient
      complaint={complaint}
      owners={ownerList.data.map((s) => ({ reference: s.reference, name: s.name }))}
    />
  );
}
