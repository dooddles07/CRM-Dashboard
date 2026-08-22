"use client";

import { MessageSquareWarning } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

export default function ComplaintError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorState
      icon={MessageSquareWarning}
      title="That case could not be loaded"
      description="The record did not come back. This has been logged."
      reference={error.digest}
      action={
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      }
    />
  );
}
