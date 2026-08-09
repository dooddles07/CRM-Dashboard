"use client";

import { useState } from "react";
import {
  Download,
  Loader2,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  Users,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { EmptyState, ErrorState } from "@/components/data/states";
import {
  CardListSkeleton,
  ChartSkeleton,
  KpiSkeleton,
  TableSkeleton,
} from "@/components/data/skeletons";
import { StatusChip, ToneDot } from "@/components/healthcare/status-chip";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Protected } from "@/components/healthcare/protected";
import {
  appointmentStatus,
  caseStatus,
  followUpStatus,
  leadStage,
  priorityMeta,
} from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const surfaces = [
  { name: "canvas", token: "--canvas", note: "Application ground" },
  { name: "surface", token: "--surface", note: "Panels and cards" },
  { name: "surface-2", token: "--surface-2", note: "Table headers, inset rows" },
  { name: "surface-3", token: "--surface-3", note: "Pressed and selected" },
  { name: "rail", token: "--rail", note: "Command rail field" },
];

const inks = [
  { name: "ink", token: "--ink", note: "Primary text · 15.5:1" },
  { name: "ink-2", token: "--ink-2", note: "Secondary text · 6.8:1" },
  { name: "ink-3", token: "--ink-3", note: "Labels and meta · 5.1:1" },
];

const statusTokens = [
  { name: "primary", note: "Actions, current selection" },
  { name: "success", note: "Completed, healthy" },
  { name: "warning", note: "Attention, due soon" },
  { name: "danger", note: "Critical, overdue, failed" },
  { name: "info", note: "Neutral state, in progress" },
  { name: "ai", note: "Generated and assistive" },
];

const typeScale = [
  { class: "text-display", label: "Display", spec: "28 / 34 · 700" },
  { class: "text-h1", label: "Page title", spec: "22 / 28 · 650" },
  { class: "text-h2", label: "Section", spec: "18 / 24 · 600" },
  { class: "text-h3", label: "Panel title", spec: "16 / 22 · 600" },
  { class: "text-body-lg", label: "Body large", spec: "15 / 23 · 400" },
  { class: "text-body", label: "Body", spec: "14 / 21 · 400" },
  { class: "text-body-sm", label: "Body small", spec: "13 / 18 · 400" },
  { class: "text-caption", label: "Caption", spec: "12 / 16 · 400" },
  { class: "text-label", label: "Label", spec: "11 / 14 · 600 · uppercase" },
  { class: "text-ident", label: "Identifier", spec: "12 / 16 · mono" },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-3">
        <h2 className="text-h2 text-ink">{title}</h2>
        <p className="mt-0.5 text-body-sm text-ink-3 measure">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-line px-4 py-3.5 last:border-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <span className="text-body-sm text-ink-3">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function DesignSystemPage() {
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [progress] = useState(64);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Design system"
        description="Every screen in CareFlow is built from the components below. One status vocabulary, one type scale, one set of surfaces — light and dark tuned separately."
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href="#healthcare">Jump to healthcare components</a>
          </Button>
        }
      />

      <div className="space-y-8">
        {/* ---------------------------------------------------------------- */}
        <Section
          id="color"
          title="Colour"
          description="Restrained by default. Colour carries status, series, and action — never decoration. Every pair below is verified against WCAG AA in both themes."
        >
          <div className="grid items-start gap-3 lg:grid-cols-3 [&>*]:min-w-0">
            <Panel>
              <PanelHeader title="Surfaces" />
              <ul className="divide-y divide-line">
                {surfaces.map((s) => (
                  <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className="size-8 shrink-0 rounded-md border border-line"
                      style={{ background: `var(${s.token})` }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-medium text-ink">
                        {s.name}
                      </span>
                      <span className="block text-caption text-ink-3">{s.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelHeader title="Text" />
              <ul className="divide-y divide-line">
                {inks.map((s) => (
                  <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className="size-8 shrink-0 rounded-md border border-line"
                      style={{ background: `var(${s.token})` }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-body-sm font-medium"
                        style={{ color: `var(${s.token})` }}
                      >
                        {s.name}
                      </span>
                      <span className="block text-caption text-ink-3">{s.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <PanelBody className="border-t border-line pt-3">
                <p className="text-caption text-ink-3">
                  Secondary text is tinted from the foreground hue, never flat grey
                  on a coloured ground.
                </p>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Status & action" />
              <ul className="divide-y divide-line">
                {statusTokens.map((s) => (
                  <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex shrink-0 gap-1">
                      <span
                        className="size-8 rounded-l-md"
                        style={{ background: `var(--${s.name})` }}
                      />
                      <span
                        className="size-8 rounded-r-md border"
                        style={{
                          background: `var(--${s.name}-soft)`,
                          borderColor: `var(--${s.name}-line)`,
                        }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-body-sm font-medium"
                        style={{ color: `var(--${s.name})` }}
                      >
                        {s.name}
                      </span>
                      <span className="block text-caption text-ink-3">{s.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel className="mt-3">
            <PanelHeader
              title="Chart series"
              description="Six categorical values ordered so adjacent pairs separate by lightness as well as hue."
            />
            <PanelBody className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 py-1 pl-1.5 pr-2.5"
                >
                  <span
                    className="size-5 rounded-sm"
                    style={{ background: `var(--chart-${i})` }}
                  />
                  <span className="text-caption text-ink-2">chart-{i}</span>
                </span>
              ))}
            </PanelBody>
          </Panel>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="type"
          title="Typography"
          description="One workhorse sans across the product. A fixed rem scale at a 1.15 ratio, not fluid — staff view at a consistent distance and a heading that shrinks inside a panel reads worse, not better."
        >
          <Panel>
            <ul className="divide-y divide-line">
              {typeScale.map((t) => (
                <li
                  key={t.class}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_5rem] sm:items-baseline sm:gap-4"
                >
                  <span className={cn(t.class, "text-ink")}>
                    {t.class === "text-ident"
                      ? "PT-102938 · 10:30"
                      : "Patient relationship management"}
                  </span>
                  <span className="text-body-sm text-ink-3">{t.label}</span>
                  <span className="text-caption text-ink-3 tabular-nums">{t.spec}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="buttons"
          title="Buttons"
          description="One shape, one height rhythm. The primary action is the only filled blue on a screen."
        >
          <Panel>
            <Row label="Primary">
              <Button size="sm">Save changes</Button>
              <Button>Book appointment</Button>
              <Button size="lg">Create patient</Button>
            </Row>
            <Row label="Secondary">
              <Button variant="outline" size="sm">
                <Download className="size-3.5" strokeWidth={2} />
                Export
              </Button>
              <Button variant="secondary">Cancel</Button>
            </Row>
            <Row label="Ghost & link">
              <Button variant="ghost">Dismiss</Button>
              <Button variant="link">View full record</Button>
            </Row>
            <Row label="Destructive">
              <Button variant="destructive" size="sm">
                <Trash2 className="size-3.5" strokeWidth={2} />
                Archive patient
              </Button>
            </Row>
            <Row label="Icon">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Search">
                    <Search className="size-4" strokeWidth={1.9} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search</TooltipContent>
              </Tooltip>
              <Button size="icon" aria-label="Add">
                <Plus className="size-4" strokeWidth={2.25} />
              </Button>
            </Row>
            <Row label="Loading & disabled">
              <Button
                disabled={loadingBtn}
                onClick={() => {
                  setLoadingBtn(true);
                  setTimeout(() => setLoadingBtn(false), 1400);
                }}
              >
                {loadingBtn && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {loadingBtn ? "Sending…" : "Send reminder"}
              </Button>
              <Button variant="outline" disabled>
                Unavailable
              </Button>
            </Row>
          </Panel>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="inputs"
          title="Inputs"
          description="Labels are always visible. Helper text explains, error text names the problem and the fix — neither does the other's job."
        >
          <div className="grid items-start gap-3 lg:grid-cols-2 [&>*]:min-w-0">
            <Panel>
              <PanelBody className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ds-text">Patient name</Label>
                  <Input id="ds-text" defaultValue="Maria Santos" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ds-help">Mobile number</Label>
                  <Input id="ds-help" placeholder="+63" aria-describedby="ds-help-text" />
                  <p id="ds-help-text" className="text-caption text-ink-3">
                    Used for appointment reminders. Include the country code.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ds-error">Email</Label>
                  <Input
                    id="ds-error"
                    defaultValue="maria.santos"
                    aria-invalid
                    aria-describedby="ds-error-text"
                  />
                  <p id="ds-error-text" className="flex items-center gap-1.5 text-caption text-danger">
                    <TriangleAlert aria-hidden className="size-3" strokeWidth={2.25} />
                    Add the part after the @, for example maria.santos@example.com
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ds-select">Department</Label>
                  <Select defaultValue="cardiology">
                    <SelectTrigger id="ds-select" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cardiology">Cardiology</SelectItem>
                      <SelectItem value="pediatrics">Pediatrics</SelectItem>
                      <SelectItem value="dermatology">Dermatology</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelBody className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ds-area">Internal note</Label>
                  <Textarea
                    id="ds-area"
                    rows={3}
                    defaultValue="Prefers morning slots. Husband usually accompanies."
                  />
                </div>
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-body-sm font-medium text-ink">
                    Preferred channel
                  </legend>
                  <RadioGroup defaultValue="sms" className="gap-2">
                    {["sms", "email", "whatsapp"].map((v) => (
                      <div key={v} className="flex items-center gap-2">
                        <RadioGroupItem value={v} id={`ds-${v}`} />
                        <Label htmlFor={`ds-${v}`} className="font-normal capitalize text-ink-2">
                          {v}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </fieldset>
                <div className="flex items-center gap-2">
                  <Checkbox id="ds-check" defaultChecked />
                  <Label htmlFor="ds-check" className="font-normal text-ink-2">
                    Send a reminder 24 hours before
                  </Label>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2.5">
                  <Label htmlFor="ds-switch" className="font-normal text-ink-2">
                    Mask contact details in exports
                  </Label>
                  <Switch id="ds-switch" defaultChecked />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label>Profile completeness</Label>
                    <span className="text-caption text-ink-3 tabular-nums">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              </PanelBody>
            </Panel>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="status"
          title="Status system"
          description="Status is always three-channel: icon, label, and colour. Remove the colour and every chip still reads correctly — which is how it works for colour-blind staff and in printed handovers."
        >
          <Panel>
            <Row label="Appointments">
              {(
                ["confirmed", "checked-in", "in-consultation", "completed", "no-show", "cancelled"] as const
              ).map((s) => (
                <StatusChip key={s} meta={appointmentStatus[s]} />
              ))}
            </Row>
            <Row label="Leads">
              {(["new", "contacted", "qualified", "booked", "converted"] as const).map((s) => (
                <StatusChip key={s} meta={leadStage[s]} />
              ))}
            </Row>
            <Row label="Follow-ups">
              {(["pending", "scheduled", "completed", "overdue"] as const).map((s) => (
                <StatusChip key={s} meta={followUpStatus[s]} />
              ))}
            </Row>
            <Row label="Cases">
              {(["new", "investigating", "waiting", "resolved", "closed"] as const).map((s) => (
                <StatusChip key={s} meta={caseStatus[s]} />
              ))}
            </Row>
            <Row label="Priority">
              {(["low", "medium", "high", "urgent"] as const).map((p) => (
                <StatusChip key={p} meta={priorityMeta[p]} />
              ))}
            </Row>
            <Row label="Sizes & variants">
              <StatusChip meta={appointmentStatus.completed} size="md" />
              <StatusChip meta={appointmentStatus.completed} variant="plain" />
              <StatusChip meta={appointmentStatus["no-show"]} variant="solid" />
            </Row>
            <Row label="Legend dots">
              {(["success", "warning", "danger", "info", "ai", "neutral"] as const).map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 text-caption text-ink-2">
                  <ToneDot tone={t} />
                  {t}
                </span>
              ))}
            </Row>
          </Panel>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="healthcare"
          title="Healthcare components"
          description="The pieces that make this a hospital CRM rather than a generic admin panel."
        >
          <div className="grid items-start gap-3 lg:grid-cols-2 [&>*]:min-w-0">
            <Panel>
              <PanelHeader
                title="Protected values"
                description="Contact details stay masked until someone deliberately reveals them. Every reveal writes an audit entry — try it."
              />
              <dl className="divide-y divide-line">
                {[
                  { label: "Mobile", value: "+63 917 421 8890", kind: "phone" as const, field: "Mobile number" },
                  { label: "Email", value: "maria.santos@example.com", kind: "email" as const, field: "Email address" },
                  { label: "Date of birth", value: "1981-03-14", kind: "dob" as const, field: "Date of birth" },
                  {
                    label: "Address",
                    value: "18 Sampaguita St, Barangay Kaunlaran, Quezon City",
                    kind: "address" as const,
                    field: "Home address",
                  },
                ].map((f) => (
                  <div key={f.field} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <dt className="text-body-sm text-ink-3">{f.label}</dt>
                    <dd className="text-body-sm text-ink">
                      <Protected
                        value={f.value}
                        kind={f.kind}
                        resource="Patient"
                        resourceId="PT-102938"
                        field={f.field}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel>
              <PanelHeader
                title="Person avatars"
                description="Initials on a stable tint. No stock portraits standing in for patients."
              />
              <PanelBody className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  {(["xs", "sm", "md", "lg", "xl"] as const).map((s) => (
                    <span key={s} className="flex flex-col items-center gap-1.5">
                      <PersonAvatar name="Maria Santos" id="PT-102938" size={s} />
                      <span className="text-caption text-ink-3">{s}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  {[
                    ["Maria Santos", "PT-102938"],
                    ["John Cruz", "PT-102914"],
                    ["Angela Reyes", "PT-102877"],
                    ["Michael Garcia", "PT-102801"],
                    ["Sofia Mendoza", "PT-102790"],
                    ["Daniel Navarro", "PT-102764"],
                  ].map(([name, id]) => (
                    <span key={id} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 py-1 pl-1 pr-2.5">
                      <PersonAvatar name={name} id={id} size="sm" />
                      <span className="text-caption text-ink-2">{name}</span>
                    </span>
                  ))}
                </div>
              </PanelBody>
            </Panel>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="feedback"
          title="Feedback & overlays"
          description="Modals are reserved for work that genuinely needs protected focus. Destructive actions say exactly what will happen and what will not."
        >
          <Panel>
            <Row label="Alerts">
              <Alert className="border-warning-line bg-warning-soft">
                <TriangleAlert className="size-4 text-warning" />
                <AlertTitle className="text-warning">
                  Pediatrics no-show rate is 11.8%
                </AlertTitle>
                <AlertDescription className="text-warning/90">
                  Above the 8% threshold for the third week. Reminder timing may need
                  review.
                </AlertDescription>
              </Alert>
            </Row>
            <Row label="Toast">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast("Reminder sent", {
                    description: "Maria Santos · SMS · delivered 10:42",
                  })
                }
              >
                Show toast
              </Button>
            </Row>
            <Row label="Dialog">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Open dialog
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add an internal note</DialogTitle>
                    <DialogDescription>
                      Notes are visible to staff with access to this patient. They are
                      never sent to the patient.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea rows={4} placeholder="What should the next person know?" />
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button>Save note</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Row>
            <Row label="Destructive">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Archive patient
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive Maria Santos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The record leaves active lists and campaigns. Appointment
                      history, notes, and the audit trail are kept. A hospital
                      administrator can restore it at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep active</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-danger text-ink-inverse hover:bg-danger/90"
                      onClick={() => toast("Patient archived", { description: "PT-102938 moved to archived." })}
                    >
                      Archive patient
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Row>
            <Row label="Tabs">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="appointments">Appointments</TabsTrigger>
                </TabsList>
              </Tabs>
            </Row>
          </Panel>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          id="states"
          title="Empty, loading & error states"
          description="Skeletons take the shape of the content they replace. Empty states say what to do next. Errors name the problem and offer a way out."
        >
          <div className="grid items-start gap-3 lg:grid-cols-2 [&>*]:min-w-0">
            <Panel>
              <PanelHeader title="Empty" />
              <EmptyState
                icon={Users}
                title="No patients match these filters"
                description="Cardiology plus 'registered this week' returns nothing. Widen the date range or clear the department filter."
                action={
                  <>
                    <Button size="sm" variant="outline">
                      Clear filters
                    </Button>
                    <Button size="sm">
                      <Plus className="size-3.5" strokeWidth={2.25} />
                      Add patient
                    </Button>
                  </>
                }
                compact
              />
            </Panel>

            <Panel>
              <PanelHeader title="Error" />
              <ErrorState
                icon={WifiOff}
                title="We could not load patient records"
                description="The connection to the patient service timed out. Your filters are still applied — retrying will not lose them."
                reference="req_8f21c4"
                action={
                  <>
                    <Button size="sm">Retry</Button>
                    <Button size="sm" variant="outline">
                      Contact support
                    </Button>
                  </>
                }
              />
            </Panel>

            <Panel className="overflow-hidden">
              <PanelHeader title="Table loading" />
              <TableSkeleton rows={4} columns={5} />
            </Panel>

            <div className="space-y-3">
              <Panel className="overflow-hidden">
                <PanelHeader title="List loading" />
                <CardListSkeleton count={3} />
              </Panel>
              <Panel>
                <PanelHeader title="Chart loading" />
                <PanelBody className="h-32">
                  <ChartSkeleton />
                </PanelBody>
              </Panel>
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-2 text-body-sm text-ink-3">KPI loading</p>
            <KpiSkeleton count={4} />
          </div>
        </Section>
      </div>
    </div>
  );
}
