"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Stethoscope } from "lucide-react";
import { doctors } from "@/lib/data/people";
import { departmentName, departments } from "@/lib/data/constants";
import { doctorStatus, noShowRisk } from "@/lib/status";
import { PageHeader } from "@/components/data/page-header";
import { EmptyState } from "@/components/data/states";
import { StatusChip } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function DoctorsPage() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return doctors.filter((d) => {
      if (department !== "all" && d.departmentId !== department) return false;
      if (status !== "all" && d.status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!d.name.toLowerCase().includes(q) && !d.specialty.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [search, department, status]);

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Doctors"
        description="The clinicians patients are matched to, with today's load and how they're performing."
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" strokeWidth={2} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or specialty" aria-label="Search doctors" className="h-8 pl-8" />
          </div>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger size="sm" className="w-auto min-w-36" aria-label="Department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {Object.entries(doctorStatus).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface shadow-card">
          <EmptyState
            icon={Stethoscope}
            title="No doctors match"
            description="Adjust the search or filters to see the roster."
            compact
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((d) => (
            <Link
              key={d.id}
              href={`/doctors/${d.id}`}
              className="group flex flex-col rounded-lg border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <div className="flex items-start gap-3">
                <PersonAvatar name={d.name} id={d.id} size="lg" initials={d.initials} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink group-hover:text-primary">{d.name}</p>
                  <p className="truncate text-body-sm text-ink-3">{d.specialty}</p>
                  <p className="mt-1 text-caption text-ink-3">{departmentName(d.departmentId)}</p>
                </div>
              </div>

              <div className="mt-3">
                <StatusChip meta={doctorStatus[d.status]} />
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <Stat label="Today" value={`${d.appointmentsToday}`} />
                <Stat label="Patients" value={d.patients.toLocaleString("en-US")} />
                <Stat label="Rating" value={`${d.satisfaction}`} />
              </dl>

              <div className="mt-2 flex items-center justify-between text-caption">
                <span className="text-ink-3">No-show rate</span>
                <StatusChip
                  meta={{ label: `${d.noShowRate}%`, tone: noShowRisk(d.noShowRate), icon: Stethoscope }}
                  showIcon={false}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-label text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
