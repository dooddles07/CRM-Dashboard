"use client";

import { TriangleAlert } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

/**
 * plan/06-screen-migration.md §1, step 5. `error.digest` is the only thing
 * that crosses from the server — the message and stack stay in the log, same
 * rule /patients/error.tsx applies. The not-found case is handled separately
 * by not-found.tsx, since it needs `notFound()` called before this boundary
 * (see page.tsx) to survive that same message-stripping.
 *
 * `retry()`, not `reset()` — node_modules/next/dist/docs's file-convention
 * reference: "In most cases, you should use retry() instead." `retry`
 * re-fetches and re-renders the boundary's children; `reset` only clears
 * error state without re-fetching, which would leave the same failed data
 * request unretried.
 */
export default function PatientRecordError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <ErrorState
        icon={TriangleAlert}
        title="That record could not be loaded"
        description="This has been logged."
        reference={error.digest}
        action={
          <Button size="sm" onClick={retry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
