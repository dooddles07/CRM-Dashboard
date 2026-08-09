"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Mail, Stethoscope, UserX } from "lucide-react";
import { toast } from "sonner";
import { doctorById } from "@/lib/data/people";
import { departmentName } from "@/lib/data/constants";
import { doctorStatus, noShowRisk } from "@/lib/status";
import { useCareflow } from "@/lib/store";
import { relativeDay } from "@/lib/format";
import { RecordHeader } from "@/components/record/record-header";
import { TabPanel } from "@/components/patient/tabs";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { EmptyState, ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

export default function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get("tab") ?? "schedule";
  const doctor = doctorById(id);
  const patients = useCareflow((s) => s.patients);

  if (!doctor) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          icon={UserX}
          title="We could not find that doctor"
          description="The profile may have been moved or you may not have access to it."
          reference={id}
          action={
            <Button size="sm" asChild>
              <Link href="/doctors">Back to doctors</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const assigned = patients.filter((p) => p.doctorId === doctor.id);

  const kpis = [
    { label: "Appointments today", value: `${doctor.appointmentsToday}` },
    { label: "Active patients", value: doctor.patients.toLocaleString("en-US") },
    { label: "Satisfaction", value: `${doctor.satisfaction} / 5` },
    { label: "No-show rate", value: `${doctor.noShowRate}%`, tone: noShowRisk(doctor.noShowRate) },
  ];

  const tabs = [
    { id: "schedule", label: "Schedule" },
    { id: "patients", label: "Patients", count: assigned.length },
    { id: "performance", label: "Performance" },
  ];

  return (
    <div className="mx-auto max-w-[100rem]">
      <RecordHeader
        breadcrumb={{ label: "Doctors", href: "/doctors" }}
        avatar={<PersonAvatar name={doctor.name} id={doctor.id} size="lg" initials={doctor.initials} />}
        title={doctor.name}
        identifier={doctor.specialty}
        chips={<StatusChip meta={doctorStatus[doctor.status]} size="md" />}
        facts={[
          { label: "Department", value: departmentName(doctor.departmentId) },
          { label: "Experience", value: `${doctor.yearsExperience} years` },
          { label: "Languages", value: doctor.languages.join(", ") },
          { label: "Email", value: doctor.email },
        ]}
        actions={
          <>
            <Button size="sm" asChild>
              <Link href="/appointments?create=1">
                <CalendarPlus className="size-3.5" strokeWidth={2.25} />
                Book with {doctor.name.split(" ")[0]}
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => toast("Message sent to reception queue")}>
              <Mail className="size-3.5" strokeWidth={2} />
              Message
            </Button>
          </>
        }
        tabs={tabs}
        activeTab={tab}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <p className="text-label text-ink-3">{k.label}</p>
            <p
              className={
                "mt-1.5 text-[1.5rem] font-semibold leading-7 tabular-nums " +
                (k.tone === "danger" ? "text-danger" : k.tone === "warning" ? "text-warning" : "text-ink")
              }
            >
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {tab === "schedule" && (
        <Panel>
          <PanelHeader title="Weekly schedule" description="Consulting hours patients can be booked into." />
          <PanelBody className="p-0">
            <ul className="divide-y divide-line">
              {doctor.schedule.map((s) => (
                <li key={s.day} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-body-sm font-medium text-ink">{s.day}</span>
                  <span className="text-body-sm text-ink-2 tabular-nums">
                    {s.from} – {s.to}
                  </span>
                </li>
              ))}
              {doctor.schedule.length === 0 && (
                <EmptyState icon={Stethoscope} title="No hours set" description="This doctor has no consulting hours configured." compact />
              )}
            </ul>
          </PanelBody>
        </Panel>
      )}

      {tab === "patients" && (
        <TabPanel title="Assigned patients" description="Patients whose care this doctor leads.">
          {assigned.length === 0 ? (
            <EmptyState icon={UserX} title="No assigned patients" description="No patient records list this doctor as their lead." compact />
          ) : (
            <ul className="divide-y divide-line">
              {assigned.map((p) => (
                <li key={p.id}>
                  <Link href={`/patients/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <PersonAvatar name={p.name} id={p.id} size="sm" initials={p.initials} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{p.name}</p>
                      <p className="text-ident text-ink-3">{p.id}</p>
                    </div>
                    <span className="text-body-sm text-ink-3">
                      {p.nextAppointment ? relativeDay(p.nextAppointment) : "No visit booked"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      )}

      {tab === "performance" && (
        <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Panel>
            <PanelHeader title="Patient satisfaction" />
            <PanelBody>
              <p className="text-[2rem] font-semibold leading-9 text-ink tabular-nums">{doctor.satisfaction}</p>
              <p className="text-body-sm text-ink-3">out of 5, across recent surveys</p>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="No-show rate" />
            <PanelBody>
              <p
                className={
                  "text-[2rem] font-semibold leading-9 tabular-nums " +
                  (noShowRisk(doctor.noShowRate) === "danger"
                    ? "text-danger"
                    : noShowRisk(doctor.noShowRate) === "warning"
                      ? "text-warning"
                      : "text-success")
                }
              >
                {doctor.noShowRate}%
              </p>
              <p className="text-body-sm text-ink-3">of booked appointments in 30 days</p>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Workload" />
            <PanelBody>
              <p className="text-[2rem] font-semibold leading-9 text-ink tabular-nums">{doctor.appointmentsToday}</p>
              <p className="text-body-sm text-ink-3">appointments on today&apos;s board</p>
            </PanelBody>
          </Panel>
        </div>
      )}
    </div>
  );
}
