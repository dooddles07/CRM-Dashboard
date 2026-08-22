"use client";

import { Timer } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

export default function FollowUpsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorState
      icon={Timer}
      title="Those follow-ups could not be loaded"
      description="The list did not come back. This has been logged."
      reference={error.digest}
      action={
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      }
    />
  );
}
