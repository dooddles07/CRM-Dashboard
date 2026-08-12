import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as referrals from "@/lib/server/services/referrals";
import { TableSkeleton } from "@/components/data/skeletons";
import { ReferralsClient } from "./referrals-client";

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
      <ReferralsData />
    </Suspense>
  );
}

async function ReferralsData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const page = await referrals.list(authed.authz, { perPage: 100 });
  return <ReferralsClient referrals={page.data} />;
}
