"use client";

import Link from "next/link";
import { List, Plus } from "lucide-react";
import { PageHeader } from "@/components/data/page-header";
import { AppointmentCalendar } from "@/components/scheduling/appointment-calendar";
import { Button } from "@/components/ui/button";

export default function AppointmentsCalendarPage() {
  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Calendar"
        description="The week at a glance. Appointment blocks are coloured by status; click one to open it."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/appointments">
                <List className="size-3.5" strokeWidth={2} />
                List view
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/appointments?create=1">
                <Plus className="size-3.5" strokeWidth={2.5} />
                Book appointment
              </Link>
            </Button>
          </>
        }
      />
      <AppointmentCalendar />
    </div>
  );
}
