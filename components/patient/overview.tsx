"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  MessageSquare,
  Pin,
  Star,
  Timer,
  TriangleAlert,
} from "lucide-react";
import type { Patient } from "@/lib/types";
import { appointmentStatus, followUpStatus, priorityMeta } from "@/lib/status";
import { departmentName, sourceLabels } from "@/lib/data/constants";
import { doctorById, staffName } from "@/lib/data/people";
import { appointmentsFor } from "@/lib/data/scheduling";
import { followUpsFor } from "@/lib/data/work";
import {
  conversationsFor,
  feedbackFor,
  notesFor,
  referralsForPatient,
} from "@/lib/data/patient-record";
import { formatDate, relativeDay, relativeTime } from "@/lib/format";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Protected } from "@/components/healthcare/protected";
import { EmptyState } from "@/components/data/states";
import { cn } from "@/lib/utils";

export function PatientOverview({ patient }: { patient: Patient }) {
  const appointments = appointmentsFor(patient.id);
  const upcoming = appointments
    .filter((a) => a.date >= new Date().toISOString().slice(0, 10) || a.status === "confirmed")
    .filter((a) => ["confirmed", "pending", "requested"].includes(a.status))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const lastVisit = appointments.find((a) => a.status === "completed");
  const openFollowUps = followUpsFor(patient.id).filter(
    (f) => f.status === "pending" || f.status === "overdue",
  );
  const threads = conversationsFor(patient.id);
  const lastMessage = threads
    .flatMap((t) => t.messages)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  const patientFeedback = feedbackFor(patient.id);
  const referrals = referralsForPatient(patient.name);
  const pinned = notesFor(patient.id).filter((n) => n.pinned);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="space-y-4 lg:col-span-2">
        {pinned.length > 0 && (
          <div className="rounded-lg border border-warning-line bg-warning-soft px-4 py-3">
            <p className="flex items-center gap-1.5 text-label text-warning">
              <Pin aria-hidden className="size-3" strokeWidth={2.5} />
              Read before contacting
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {pinned.map((n) => (
                <li key={n.id} className="text-body-sm leading-5 text-warning">
                  {n.body}
                  <span className="ml-1 text-caption opacity-80">— {n.author}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Panel>
            <PanelHeader title="Next appointment" />
            {upcoming ? (
              <PanelBody>
                <p className="text-h2 text-ink">{relativeDay(upcoming.date)}</p>
                <p className="mt-0.5 text-body-sm text-ink-2 tabular-nums">
                  {formatDate(upcoming.date)} · {upcoming.start}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusChip meta={appointmentStatus[upcoming.status]} />
                  <span className="text-body-sm text-ink-3">{upcoming.type}</span>
                </div>
                <p className="mt-2 border-t border-line pt-2 text-body-sm text-ink-3">
                  {doctorById(upcoming.doctorId)?.name} ·{" "}
                  {departmentName(upcoming.departmentId)}
                  <br />
                  {upcoming.location}
                </p>
              </PanelBody>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Nothing booked"
                description="This patient has no upcoming appointment."
                compact
              />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Last visit" />
            {lastVisit ? (
              <PanelBody>
                <p className="text-h2 text-ink">{relativeDay(lastVisit.date)}</p>
                <p className="mt-0.5 text-body-sm text-ink-2 tabular-nums">
                  {formatDate(lastVisit.date)} · {lastVisit.start}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusChip meta={appointmentStatus[lastVisit.status]} />
                  <span className="text-body-sm text-ink-3">{lastVisit.type}</span>
                </div>
                <p className="mt-2 border-t border-line pt-2 text-body-sm text-ink-3">
                  {lastVisit.reason}
                </p>
              </PanelBody>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No completed visits"
                description="This patient has not attended an appointment yet."
                compact
              />
            )}
          </Panel>
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Outstanding follow-ups"
            description={
              openFollowUps.length === 0
                ? "Nothing owed"
                : `${openFollowUps.length} open · ${openFollowUps.filter((f) => f.status === "overdue").length} overdue`
            }
          />
          {openFollowUps.length === 0 ? (
            <EmptyState
              icon={Timer}
              title="Nothing outstanding"
              description="Every follow-up for this patient has been completed."
              compact
            />
          ) : (
            <ul className="divide-y divide-line">
              {openFollowUps.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-sm font-medium text-ink">{f.type}</p>
                      <StatusChip meta={followUpStatus[f.status]} />
                      <StatusChip meta={priorityMeta[f.priority]} />
                    </div>
                    <p className="mt-0.5 text-body-sm text-ink-3">{f.note}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-body-sm tabular-nums",
                        f.status === "overdue" ? "font-medium text-danger" : "text-ink-2",
                      )}
                    >
                      {relativeDay(f.dueDate)}
                    </p>
                    <p className="text-caption text-ink-3">{staffName(f.ownerId)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Recent communication"
            actions={
              <Link
                href="/inbox"
                className="inline-flex items-center gap-1 text-body-sm text-primary underline-offset-2 hover:underline"
              >
                Open inbox
                <ArrowRight aria-hidden className="size-3.5" strokeWidth={2.25} />
              </Link>
            }
          />
          {lastMessage ? (
            <PanelBody>
              <p className="text-body-sm leading-5 text-ink">{lastMessage.body}</p>
              <p className="mt-1.5 text-caption text-ink-3">
                {lastMessage.direction === "inbound" ? "From patient" : "Sent"} ·{" "}
                {lastMessage.channel.toUpperCase()} · {relativeTime(lastMessage.sentAt)}
              </p>
            </PanelBody>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="No messages yet"
              description={`Reach out on ${patient.preferredChannel.toUpperCase()}, this patient's preferred channel.`}
              compact
            />
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Summary" />
          <dl className="divide-y divide-line">
            {[
              { label: "Date of birth", node: <Protected value={patient.dateOfBirth} kind="dob" resource="Patient" resourceId={patient.id} field="Date of birth" /> },
              { label: "Email", node: <Protected value={patient.email} kind="email" resource="Patient" resourceId={patient.id} field="Email address" /> },
              { label: "Address", node: <Protected value={patient.address} kind="address" resource="Patient" resourceId={patient.id} field="Home address" /> },
              {
                label: "Emergency contact",
                node: (
                  <span>
                    {patient.emergencyContact.name}{" "}
                    <span className="text-ink-3">({patient.emergencyContact.relation})</span>
                  </span>
                ),
              },
              { label: "Preferred channel", node: patient.preferredChannel.toUpperCase() },
              { label: "Insurance", node: patient.insurance ?? "Self-paying" },
              { label: "Registered", node: formatDate(patient.registeredAt) },
              { label: "Source", node: sourceLabels[patient.source] },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="shrink-0 text-body-sm text-ink-3">{row.label}</dt>
                <dd className="min-w-0 truncate text-right text-body-sm text-ink">
                  {row.node}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="Satisfaction" />
          {patientFeedback.length === 0 ? (
            <EmptyState
              icon={Star}
              title="No responses yet"
              description="Feedback surveys sent after a visit will show here."
              compact
            />
          ) : (
            <PanelBody>
              <div className="flex items-center gap-2">
                <span className="text-h1 text-ink tabular-nums">
                  {(
                    patientFeedback.reduce((s, f) => s + f.rating, 0) /
                    patientFeedback.length
                  ).toFixed(1)}
                </span>
                <span className="flex items-center gap-0.5" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "size-3.5",
                        i <
                        Math.round(
                          patientFeedback.reduce((s, f) => s + f.rating, 0) /
                            patientFeedback.length,
                        )
                          ? "fill-warning-solid text-warning-solid"
                          : "text-line-strong",
                      )}
                      strokeWidth={2}
                    />
                  ))}
                </span>
              </div>
              <p className="mt-1 text-body-sm text-ink-3">
                {patientFeedback.length} response
                {patientFeedback.length === 1 ? "" : "s"}
              </p>
              <p className="mt-2 border-t border-line pt-2 text-body-sm leading-5 text-ink-2">
                “{patientFeedback[0].comment}”
              </p>
            </PanelBody>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Referrals" description={`${referrals.length} on record`} />
          {referrals.length === 0 ? (
            <EmptyState
              icon={TriangleAlert}
              title="No referrals"
              description="This patient came to the hospital directly."
              compact
            />
          ) : (
            <ul className="divide-y divide-line">
              {referrals.map((r) => (
                <li key={r.id} className="px-4 py-2">
                  <p className="truncate text-body-sm font-medium text-ink">{r.provider}</p>
                  <p className="text-caption text-ink-3">
                    {r.providerType} · {formatDate(r.receivedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
