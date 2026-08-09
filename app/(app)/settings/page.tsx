"use client";

import { useState } from "react";
import { Building2, Check, Rows2, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { CURRENT_USER, HOSPITAL } from "@/lib/data/constants";
import { useCareflow } from "@/lib/store";
import { PageHeader } from "@/components/data/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/data/panel";
import { Field } from "@/components/shared/create-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const notificationCategories = [
  { id: "appointments", label: "Appointments", hint: "Bookings, reschedules, and no-shows" },
  { id: "tasks", label: "Tasks", hint: "Assignments and due dates" },
  { id: "leads", label: "Leads", hint: "New enquiries assigned to you" },
  { id: "follow-ups", label: "Follow-ups", hint: "Due and overdue reminders" },
  { id: "complaints", label: "Complaints", hint: "New cases and SLA breaches" },
  { id: "security", label: "Security", hint: "Sign-ins and sensitive actions" },
];

export default function SettingsPage() {
  const density = useCareflow((s) => s.density);
  const setDensity = useCareflow((s) => s.setDensity);
  const [notifs, setNotifs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(notificationCategories.map((c) => [c.id, c.id !== "leads"])),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description="Your profile, notifications, and how CareFlow looks and feels." />

      <Tabs defaultValue="profile" className="gap-4">
        <TabsList variant="line" className="w-full justify-start border-b border-line">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="hospital">Hospital</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Panel>
            <PanelHeader title="Profile" description="How you appear to the rest of the team." />
            <PanelBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="st-name">
                  <Input id="st-name" defaultValue={CURRENT_USER.name} />
                </Field>
                <Field label="Email" htmlFor="st-email">
                  <Input id="st-email" type="email" defaultValue={CURRENT_USER.email} />
                </Field>
                <Field label="Role" htmlFor="st-role">
                  <Input id="st-role" defaultValue={CURRENT_USER.role} disabled />
                </Field>
                <Field label="Phone" htmlFor="st-phone">
                  <Input id="st-phone" placeholder="+63 ..." />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => toast("Profile saved")}>
                  <Check className="size-3.5" strokeWidth={2.25} />
                  Save changes
                </Button>
              </div>
            </PanelBody>
          </Panel>
        </TabsContent>

        <TabsContent value="notifications">
          <Panel>
            <PanelHeader title="Notifications" description="Choose what reaches you and where." />
            <PanelBody className="space-y-1">
              {notificationCategories.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">{c.label}</p>
                    <p className="text-caption text-ink-3">{c.hint}</p>
                  </div>
                  <Switch
                    checked={notifs[c.id]}
                    onCheckedChange={(v) => setNotifs((n) => ({ ...n, [c.id]: v }))}
                    aria-label={c.label}
                  />
                </div>
              ))}
            </PanelBody>
          </Panel>
        </TabsContent>

        <TabsContent value="appearance">
          <Panel>
            <PanelHeader title="Appearance" description="Table density applies across every list in the app." />
            <PanelBody className="space-y-4">
              <div>
                <p className="mb-2 text-label text-ink-3">Density</p>
                <div className="grid max-w-md grid-cols-2 gap-3">
                  <DensityOption
                    active={density === "comfortable"}
                    onClick={() => setDensity("comfortable")}
                    icon={Rows2}
                    label="Comfortable"
                    hint="Roomier rows"
                  />
                  <DensityOption
                    active={density === "compact"}
                    onClick={() => setDensity("compact")}
                    icon={Rows3}
                    label="Compact"
                    hint="More rows per screen"
                  />
                </div>
              </div>
              <p className="text-caption text-ink-3">Light and dark themes follow the toggle in the top bar.</p>
            </PanelBody>
          </Panel>
        </TabsContent>

        <TabsContent value="hospital">
          <Panel>
            <PanelHeader title="Hospital" description="Organisation details used across the product." />
            <PanelBody>
              <div className="flex items-center gap-3 border-b border-line pb-4">
                <span className="inline-flex size-12 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3">
                  <Building2 className="size-6" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-h3 text-ink">{HOSPITAL.name}</p>
                  <p className="text-body-sm text-ink-3">{HOSPITAL.city}</p>
                </div>
              </div>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-label text-ink-3">Beds</dt>
                  <dd className="mt-1 text-h3 text-ink tabular-nums">{HOSPITAL.beds}</dd>
                </div>
                <div>
                  <dt className="text-label text-ink-3">City</dt>
                  <dd className="mt-1 text-h3 text-ink">{HOSPITAL.city}</dd>
                </div>
                <div>
                  <dt className="text-label text-ink-3">Timezone</dt>
                  <dd className="mt-1 text-body-lg text-ink">{HOSPITAL.timezone}</dd>
                </div>
              </dl>
            </PanelBody>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DensityOption({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Rows2;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer",
        active ? "border-primary bg-primary-soft/50" : "border-line bg-surface hover:bg-surface-2",
      )}
    >
      <Icon className={cn("size-5", active ? "text-primary" : "text-ink-3")} strokeWidth={1.9} />
      <div>
        <p className={cn("text-body-sm font-medium", active ? "text-primary-soft-fg" : "text-ink")}>{label}</p>
        <p className="text-caption text-ink-3">{hint}</p>
      </div>
      {active && <Check className="ml-auto size-4 text-primary" strokeWidth={2.5} />}
    </button>
  );
}
