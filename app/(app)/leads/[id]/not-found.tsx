"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Waypoints } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

export default function LeadNotFound() {
  const reference = usePathname().split("/").pop();

  return (
    <div className="mx-auto max-w-2xl">
      <ErrorState
        icon={Waypoints}
        title="We could not find that lead"
        description="It may have been converted, merged, or you may not have access to it."
        reference={reference}
        action={
          <Button size="sm" asChild>
            <Link href="/leads">Back to leads</Link>
          </Button>
        }
      />
    </div>
  );
}
