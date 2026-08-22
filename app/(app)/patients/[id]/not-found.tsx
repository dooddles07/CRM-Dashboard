"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserX } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

/**
 * `not-found.tsx` receives no props — Next 16's file-convention docs are
 * explicit that these components take no params, so unlike error.tsx there
 * is no `error.digest` to point at. `usePathname()` recovers the reference
 * the visitor actually typed, since `/patients/notFound()` and
 * `/patients/malformed-id` both render this same file.
 */
export default function PatientNotFound() {
  const reference = usePathname().split("/").pop();

  return (
    <div className="mx-auto max-w-2xl">
      <ErrorState
        icon={UserX}
        title="We could not find that patient"
        description="The record may have been archived, merged, or you may not have access to it."
        reference={reference}
        action={
          <>
            <Button size="sm" asChild>
              <Link href="/patients">Back to patients</Link>
            </Button>
            <Button size="sm" variant="outline">
              Contact support
            </Button>
          </>
        }
      />
    </div>
  );
}
