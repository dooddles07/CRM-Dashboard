"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Channel, DepartmentId, LeadSource, Patient } from "@/lib/types";
import { useCareflow } from "@/lib/store";
import {
  TODAY,
  departmentName,
  departments,
  patientTags,
  sourceLabels,
} from "@/lib/data/constants";
import { doctors } from "@/lib/data/people";
import { initialsOf } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const steps = [
  { id: 1, label: "Identity & contact", hint: "Who the patient is and how to reach them" },
  { id: 2, label: "Care & preferences", hint: "Where they are seen and how they want contact" },
  { id: 3, label: "Review", hint: "Check before creating the record" },
];

interface Draft {
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: Patient["gender"];
  address: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;
  departmentId: DepartmentId;
  doctorId: string;
  preferredChannel: Channel;
  source: LeadSource;
  insurance: string;
  tags: string[];
  notes: string;
}

const empty: Draft = {
  name: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  gender: "Female",
  address: "",
  emergencyName: "",
  emergencyRelation: "",
  emergencyPhone: "",
  departmentId: "general-medicine",
  doctorId: "dr-006",
  preferredChannel: "sms",
  source: "walk-in",
  insurance: "",
  tags: ["New patient"],
  notes: "",
};

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-caption text-danger">
          <CircleAlert aria-hidden className="size-3" strokeWidth={2.25} />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function NewPatientPage() {
  const router = useRouter();
  const addPatient = useCareflow((s) => s.addPatient);
  const logAudit = useCareflow((s) => s.logAudit);

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [pending, setPending] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function validateStep1() {
    const next: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) next.name = "Enter the patient's full name as it appears on their ID.";
    if (!draft.phone.trim()) next.phone = "A mobile number is required for appointment reminders.";
    if (draft.email && !draft.email.includes("@"))
      next.email = "Add the part after the @, for example maria.santos@example.com";
    if (!draft.dateOfBirth) next.dateOfBirth = "Date of birth is needed to match existing records.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function next() {
    if (step === 1 && !validateStep1()) return;
    setStep((s) => Math.min(s + 1, 3));
  }

  function create() {
    setPending(true);
    const year = Number(draft.dateOfBirth.slice(0, 4)) || 1990;
    const patient: Patient = {
      id: `PT-${Math.floor(103000 + Math.random() * 900)}`,
      name: draft.name.trim(),
      initials: initialsOf(draft.name.trim()),
      phone: draft.phone.trim(),
      email: draft.email.trim() || "not-provided@example.com",
      dateOfBirth: draft.dateOfBirth,
      age: 2026 - year,
      gender: draft.gender,
      address: draft.address.trim() || "Not provided",
      emergencyContact: {
        name: draft.emergencyName.trim() || "Not provided",
        relation: draft.emergencyRelation.trim() || "—",
        phone: draft.emergencyPhone.trim() || draft.phone.trim(),
      },
      preferredChannel: draft.preferredChannel,
      departmentId: draft.departmentId,
      doctorId: draft.doctorId,
      registeredAt: TODAY,
      lastVisit: null,
      nextAppointment: null,
      status: "new",
      tags: draft.tags,
      insurance: draft.insurance.trim() || null,
      source: draft.source,
      satisfaction: null,
      outstandingFollowUps: 0,
      notes: draft.notes.trim() || null,
    };

    addPatient(patient);
    logAudit({
      action: "created",
      resource: "Patient",
      resourceId: patient.id,
      field: null,
      previousValue: null,
      newValue: patient.name,
    });

    setTimeout(() => {
      toast("Patient created", {
        description: `${patient.name} · ${patient.id} · contact details are masked by default.`,
      });
      router.push(`/patients/${patient.id}`);
    }, 500);
  }

  const departmentDoctors = doctors.filter((d) => d.departmentId === draft.departmentId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add patient"
        description="Three steps. Only the name, mobile number, and date of birth are required to create the record."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/patients">
              <ArrowLeft className="size-3.5" strokeWidth={2} />
              Cancel
            </Link>
          </Button>
        }
      />

      <ol className="mb-4 flex flex-wrap gap-2">
        {steps.map((s) => {
          const state = s.id === step ? "current" : s.id < step ? "done" : "upcoming";
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <div
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2",
                  state === "current" && "border-primary-line bg-primary-soft",
                  state === "done" && "border-success-line bg-success-soft",
                  state === "upcoming" && "border-line bg-surface",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                    state === "current" && "bg-primary text-primary-fg",
                    state === "done" && "bg-success text-ink-inverse",
                    state === "upcoming" && "bg-surface-3 text-ink-3",
                  )}
                >
                  {state === "done" ? <Check aria-hidden className="size-3" strokeWidth={3} /> : s.id}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-body-sm font-medium",
                      state === "current" && "text-primary-soft-fg",
                      state === "done" && "text-success",
                      state === "upcoming" && "text-ink-3",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="hidden truncate text-caption text-ink-3 sm:block">
                    {s.hint}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <Panel>
        <PanelHeader
          title={steps[step - 1].label}
          description={steps[step - 1].hint}
        />
        <PanelBody className="space-y-4">
          {step === 1 && (
            <>
              <Field id="name" label="Full name" error={errors.name}>
                <Input
                  id="name"
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  autoComplete="off"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="phone"
                  label="Mobile number"
                  error={errors.phone}
                  hint="Include the country code."
                >
                  <Input
                    id="phone"
                    value={draft.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="+63"
                    aria-invalid={Boolean(errors.phone)}
                  />
                </Field>
                <Field id="email" label="Email (optional)" error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    value={draft.email}
                    onChange={(e) => set("email", e.target.value)}
                    aria-invalid={Boolean(errors.email)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="dob" label="Date of birth" error={errors.dateOfBirth}>
                  <Input
                    id="dob"
                    type="date"
                    value={draft.dateOfBirth}
                    onChange={(e) => set("dateOfBirth", e.target.value)}
                    aria-invalid={Boolean(errors.dateOfBirth)}
                  />
                </Field>
                <div className="space-y-1.5">
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={draft.gender}
                    onValueChange={(v) => set("gender", v as Patient["gender"])}
                  >
                    <SelectTrigger id="gender" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Field id="address" label="Home address (optional)">
                <Input
                  id="address"
                  value={draft.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>

              <fieldset className="grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                <legend className="sr-only">Emergency contact</legend>
                <Field id="ec-name" label="Emergency contact">
                  <Input
                    id="ec-name"
                    value={draft.emergencyName}
                    onChange={(e) => set("emergencyName", e.target.value)}
                  />
                </Field>
                <Field id="ec-rel" label="Relationship">
                  <Input
                    id="ec-rel"
                    value={draft.emergencyRelation}
                    onChange={(e) => set("emergencyRelation", e.target.value)}
                  />
                </Field>
                <Field id="ec-phone" label="Their number">
                  <Input
                    id="ec-phone"
                    value={draft.emergencyPhone}
                    onChange={(e) => set("emergencyPhone", e.target.value)}
                  />
                </Field>
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dept">Primary department</Label>
                  <Select
                    value={draft.departmentId}
                    onValueChange={(v) => {
                      set("departmentId", v as DepartmentId);
                      const first = doctors.find((d) => d.departmentId === v);
                      if (first) set("doctorId", first.id);
                    }}
                  >
                    <SelectTrigger id="dept" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doc">Assigned doctor</Label>
                  <Select value={draft.doctorId} onValueChange={(v) => set("doctorId", v)}>
                    <SelectTrigger id="doc" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {departmentDoctors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} · {d.specialty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="channel">Preferred contact channel</Label>
                  <Select
                    value={draft.preferredChannel}
                    onValueChange={(v) => set("preferredChannel", v as Channel)}
                  >
                    <SelectTrigger id="channel" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="call">Phone call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="source">How they found us</Label>
                  <Select
                    value={draft.source}
                    onValueChange={(v) => set("source", v as LeadSource)}
                  >
                    <SelectTrigger id="source" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(sourceLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Field id="insurance" label="Insurance provider (optional)" hint="Leave empty for self-paying patients.">
                <Input
                  id="insurance"
                  value={draft.insurance}
                  onChange={(e) => set("insurance", e.target.value)}
                />
              </Field>

              <fieldset className="border-t border-line pt-4">
                <legend className="mb-2 text-body-sm font-medium text-ink">Tags</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {patientTags.map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <Checkbox
                        id={`tag-${t}`}
                        checked={draft.tags.includes(t)}
                        onCheckedChange={(v) =>
                          set(
                            "tags",
                            v ? [...draft.tags, t] : draft.tags.filter((x) => x !== t),
                          )
                        }
                      />
                      <Label htmlFor={`tag-${t}`} className="font-normal text-ink-2">
                        {t}
                      </Label>
                    </div>
                  ))}
                </div>
              </fieldset>

              <Field id="notes" label="Internal note (optional)" hint="Visible to staff only. Never sent to the patient.">
                <Textarea
                  id="notes"
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <dl className="divide-y divide-line rounded-md border border-line">
                {[
                  ["Name", draft.name],
                  ["Mobile", draft.phone],
                  ["Email", draft.email || "Not provided"],
                  ["Date of birth", draft.dateOfBirth],
                  ["Gender", draft.gender],
                  ["Department", departmentName(draft.departmentId)],
                  ["Assigned doctor", doctors.find((d) => d.id === draft.doctorId)?.name ?? "—"],
                  ["Preferred channel", draft.preferredChannel.toUpperCase()],
                  ["Source", sourceLabels[draft.source]],
                  ["Insurance", draft.insurance || "Self-paying"],
                  ["Tags", draft.tags.join(", ") || "None"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 px-3 py-2"
                  >
                    <dt className="shrink-0 text-body-sm text-ink-3">{label}</dt>
                    <dd className="min-w-0 text-right text-body-sm text-ink">{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="flex gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-caption leading-4 text-ink-3">
                <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.9} />
                <span>
                  Contact details are masked in lists and exports. Staff can reveal
                  them one field at a time, and every reveal is written to the audit
                  log against this patient.
                </span>
              </p>
            </>
          )}
        </PanelBody>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(s - 1, 1))}
            disabled={step === 1 || pending}
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            Back
          </Button>

          {step < 3 ? (
            <Button onClick={next}>
              Continue
              <ArrowRight className="size-4" strokeWidth={2} />
            </Button>
          ) : (
            <Button onClick={create} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {pending ? "Creating…" : "Create patient"}
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
