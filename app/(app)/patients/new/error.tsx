"use client";

import { TriangleAlert } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

/** `retry()`, not `reset()` — see the comment on patients/[id]/error.tsx. */
export default function NewPatientError({
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
        title="The patient form could not be loaded"
        description="The department and doctor lists did not come back. This has been logged."
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
