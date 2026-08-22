"use client";

import { TriangleAlert } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

export default function AppointmentRecordError({
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
        title="That appointment could not be loaded"
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
