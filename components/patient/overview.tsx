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
import type { PatientDetailDTO } from "@/lib/server/services/patients";
import type { PatientRecordBundle } from "@/lib/server/services/patient-record";
import { appointmentStatus, followUpStatus, priorityMeta } from "@/lib/status";
import { sourceLabels } from "@/lib/labels";
import { formatDate, formatTime, relativeDay, relativeTime } from "@/lib/format";
import { useViewer } from "@/components/shell/viewer-context";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Protected } from "@/components/healthcare/protected";
import { EmptyState } from "@/components/data/states";
import { cn } from "@/lib/utils";

/** `YYYY-MM-DD` in the viewer's local timezone, not `date.toISOString()`'s UTC one. */
function localDateOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

interface PatientOverviewProps {
  patient: PatientDetailDTO;
  record: PatientRecordBundle;
}

export function PatientOverview({ patient, record }: PatientOverviewProps) {
  // Courtesy only: revealAction checks the same capability server-side.
  const canReveal = useViewer().permissions.capabilities.includes("reveal");

  // Computed here, client-side, from the viewer's own clock, and compared
  // against each appointment's *local* calendar date — not `startsAt`'s raw
  // UTC digits (`.slice(0, 10)`). lib/format.ts renders these same
  // timestamps a few lines down by parsing them in the viewer's local
  // timezone; comparing local-to-local here is what keeps this filter and
  // that display agreeing near a UTC day boundary.
  const today = localDateOf(new Date());
  const upcoming = record.appointments
    .filter((a) => ["confirmed", "pending", "requested"].includes(a.status))
    .filter((a) => localDateOf(new Date(a.startsAt)) >= today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const lastVisit = record.appointments.find((a) => a.status === "completed");
  const openFollowUps = record.followUps.filter(
    (f) => f.status === "pending" || f.status === "overdue",
  );
  const lastConversation = record.conversations[0];
  const pinned = record.notes.filter((n) => n.pinned);

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
                <li key={n.reference} className="text-body-sm leading-5 text-warning">
                  {n.body}
                  <span className="ml-1 text-caption opacity-80">— {n.author ?? "Unknown"}</span>
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
                <p className="text-h2 text-ink">{relativeDay(upcoming.startsAt)}</p>
                <p className="mt-0.5 text-body-sm text-ink-2 tabular-nums">
                  {formatDate(upcoming.startsAt)} · {formatTime(upcoming.startsAt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusChip meta={appointmentStatus[upcoming.status]} />
                  <span className="text-body-sm text-ink-3">{upcoming.type}</span>
                </div>
                <p className="mt-2 border-t border-line pt-2 text-body-sm text-ink-3">
                  {upcoming.doctor?.name ?? "Unassigned"} · {upcoming.department ?? "Unassigned"}
                  {upcoming.location && (
                    <>
                      <br />
                      {upcoming.location}
                    </>
                  )}
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
                <p className="text-h2 text-ink">{relativeDay(lastVisit.startsAt)}</p>
                <p className="mt-0.5 text-body-sm text-ink-2 tabular-nums">
                  {formatDate(lastVisit.startsAt)} · {formatTime(lastVisit.startsAt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusChip meta={appointmentStatus[lastVisit.status]} />
                  <span className="text-body-sm text-ink-3">{lastVisit.type}</span>
                </div>
                {lastVisit.reason && (
                  <p className="mt-2 border-t border-line pt-2 text-body-sm text-ink-3">
                    {lastVisit.reason}
                  </p>
                )}
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
              record.openFollowUpCount === 0
                ? "Nothing owed"
                : `${record.openFollowUpCount} open · ${openFollowUps.filter((f) => f.status === "overdue").length} overdue`
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
                  key={f.reference}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-sm font-medium text-ink">{f.type}</p>
                      <StatusChip meta={followUpStatus[f.status]} />
                      <StatusChip meta={priorityMeta[f.priority]} />
                    </div>
                    {f.note && <p className="mt-0.5 text-body-sm text-ink-3">{f.note}</p>}
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
                    <p className="text-caption text-ink-3">{f.owner ?? "Unassigned"}</p>
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
          {lastConversation ? (
            <PanelBody>
              <p className="text-body-sm leading-5 text-ink">{lastConversation.subject}</p>
              <p className="mt-1.5 text-caption text-ink-3">
                {lastConversation.channel.toUpperCase()} · {lastConversation.messageCount} message
                {lastConversation.messageCount === 1 ? "" : "s"} ·{" "}
                {relativeTime(lastConversation.lastMessageAt)}
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
              {
                label: "Date of birth",
                node: (
                  <Protected
                    masked={patient.dateOfBirth.masked}
                    revealable={patient.dateOfBirth.revealable && canReveal}
                    resource="patient"
                    resourceId={patient.reference}
                    field="dateOfBirth"
                    label="Date of birth"
                  />
                ),
              },
              {
                label: "Email",
                node: (
                  <Protected
                    masked={patient.email.masked}
                    revealable={patient.email.revealable && canReveal}
                    resource="patient"
                    resourceId={patient.reference}
                    field="email"
                    label="Email address"
                  />
                ),
              },
              {
                label: "Address",
                node: (
                  <Protected
                    masked={patient.address.masked}
                    revealable={patient.address.revealable && canReveal}
                    resource="patient"
                    resourceId={patient.reference}
                    field="address"
                    label="Home address"
                  />
                ),
              },
              {
                label: "Emergency contact",
                node: record.emergencyContact ? (
                  <span>
                    {record.emergencyContact.name}{" "}
                    <span className="text-ink-3">({record.emergencyContact.relation})</span>
                  </span>
                ) : (
                  "Not provided"
                ),
              },
              { label: "Preferred channel", node: patient.preferredChannel.toUpperCase() },
              { label: "Insurance", node: patient.insurance ?? "Self-paying" },
              { label: "Registered", node: formatDate(patient.registeredAt) },
              { label: "Source", node: sourceLabels[patient.source as keyof typeof sourceLabels] ?? patient.source },
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
          {record.feedback.length === 0 ? (
            <EmptyState
              icon={Star}
              title="No responses yet"
              description="Feedback surveys sent after a visit will show here."
              compact
            />
          ) : (
            <PanelBody>
              {(() => {
                const avgRating =
                  record.feedback.reduce((s, f) => s + f.rating, 0) / record.feedback.length;
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-h1 text-ink tabular-nums">{avgRating.toFixed(1)}</span>
                    <span className="flex items-center gap-0.5" aria-hidden>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "size-3.5",
                            i < Math.round(avgRating)
                              ? "fill-warning-solid text-warning-solid"
                              : "text-line-strong",
                          )}
                          strokeWidth={2}
                        />
                      ))}
                    </span>
                  </div>
                );
              })()}
              <p className="mt-1 text-body-sm text-ink-3">
                {record.feedback.length} response
                {record.feedback.length === 1 ? "" : "s"}
              </p>
              {record.feedback[0].comment && (
                <p className="mt-2 border-t border-line pt-2 text-body-sm leading-5 text-ink-2">
                  “{record.feedback[0].comment}”
                </p>
              )}
            </PanelBody>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Referrals" description={`${record.referrals.length} on record`} />
          {record.referrals.length === 0 ? (
            <EmptyState
              icon={TriangleAlert}
              title="No referrals"
              description="This patient came to the hospital directly."
              compact
            />
          ) : (
            <ul className="divide-y divide-line">
              {record.referrals.map((r) => (
                <li key={r.reference} className="px-4 py-2">
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
