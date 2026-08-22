import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as leads from "@/lib/server/services/leads";
import * as directory from "@/lib/server/services/directory";
import { reference as referenceSchema } from "@/lib/server/api/schemas";
import { NotFoundError } from "@/lib/server/services/errors";
import { RecordSkeleton } from "@/components/data/skeletons";
import { LeadRecordClient } from "./lead-client";

/** Same detail-page pattern as /appointments/[id]/page.tsx. */
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const { id } = await props.params;
  const parsed = referenceSchema.safeParse(id);
  if (!parsed.success) notFound();

  return (
    <Suspense fallback={<RecordSkeleton />}>
      <LeadRecordData reference={parsed.data} />
    </Suspense>
  );
}

async function LeadRecordData({ reference }: { reference: string }) {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  let lead: leads.LeadDTO;
  let history: Awaited<ReturnType<typeof leads.stageHistory>>;
  try {
    [lead, history] = await Promise.all([
      leads.byReference(session, reference),
      leads.stageHistory(session, reference),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const departmentList = await directory.listDepartments(session);

  return (
    <LeadRecordClient
      lead={lead}
      history={history}
      departments={departmentList.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
