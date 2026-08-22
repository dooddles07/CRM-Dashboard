import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { List, Plus } from "lucide-react";
import { requireSession } from "@/lib/server/auth/session";
import * as appointments from "@/lib/server/services/appointments";
import { PageHeader } from "@/components/data/page-header";
import { ChartSkeleton } from "@/components/data/skeletons";
import { Button } from "@/components/ui/button";
import { AppointmentCalendar } from "@/components/scheduling/appointment-calendar";

export default async function AppointmentsCalendarPage() {
  const authed = await requireSession();
  if (!authed) redirect("/login");

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
      <Suspense fallback={<ChartSkeleton className="h-[40rem]" />}>
        <CalendarData />
      </Suspense>
    </div>
  );
}

async function CalendarData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");
  const session = authed.authz;

  // The grid navigates weeks client-side over one fetch, same reasoning as
  // /patients' client-side filtering: the board is small enough that one
  // wide page beats a round trip per week flipped.
  const page = await appointments.list(session, { perPage: 100 });

  return <AppointmentCalendar appointments={page.data} />;
}
