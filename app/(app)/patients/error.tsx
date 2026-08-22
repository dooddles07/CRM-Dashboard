"use client";

import { TriangleAlert } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

/**
 * plan/06-screen-migration.md §1, step 5.
 *
 * `error.digest` is Next's server-side error id and the only thing that
 * crosses from the server — the message and stack stay in the log. That is
 * the same rule `handle` applies to the HTTP API, for the same reason: a
 * database error rendered to a browser is a leak.
 */
export default function PatientsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorState
      icon={TriangleAlert}
      title="Those patients could not be loaded"
      description="The record list did not come back. This has been logged."
      reference={error.digest}
      action={
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      }
    />
  );
}
