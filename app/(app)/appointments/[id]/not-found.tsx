"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarX } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

export default function AppointmentNotFound() {
  const reference = usePathname().split("/").pop();

  return (
    <div className="mx-auto max-w-2xl">
      <ErrorState
        icon={CalendarX}
        title="We could not find that appointment"
        description="It may have been cancelled, merged into another appointment, or you may not have access to it."
        reference={reference}
        action={
          <Button size="sm" asChild>
            <Link href="/appointments">Back to appointments</Link>
          </Button>
        }
      />
    </div>
  );
}
