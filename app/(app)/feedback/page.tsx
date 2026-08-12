import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as feedback from "@/lib/server/services/feedback";
import { CardListSkeleton } from "@/components/data/skeletons";
import { FeedbackClient } from "./feedback-client";

export default function Page() {
  return (
    <Suspense fallback={<CardListSkeleton />}>
      <FeedbackData />
    </Suspense>
  );
}

async function FeedbackData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  // The summary is computed across everything the caller can see, separately
  // from the page of rows, so filtering the list never moves the headline.
  const [page, summary] = await Promise.all([
    feedback.list(authed.authz, { perPage: 100 }),
    feedback.ratingSummary(authed.authz),
  ]);

  return <FeedbackClient feedback={page.data} summary={summary} />;
}
