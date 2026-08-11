"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  ClipboardList,
  Send,
  Stethoscope,
  UserPlus,
  Waypoints,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { visibleNavigation } from "@/lib/nav";
import type { PermissionSet } from "@/lib/server/authz/policy";
import { useCareflow } from "@/lib/store";
import { doctors } from "@/lib/data/people";
import { departmentName } from "@/lib/data/constants";
import { patientStatus } from "@/lib/status";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { ToneDot } from "@/components/healthcare/status-chip";

const quickActions = [
  { label: "Create patient", href: "/patients/new", icon: UserPlus, shortcut: "P" },
  { label: "Create appointment", href: "/appointments?create=1", icon: CalendarPlus, shortcut: "A" },
  { label: "Create task", href: "/tasks?create=1", icon: ClipboardList, shortcut: "T" },
  { label: "Create lead", href: "/leads?create=1", icon: Waypoints, shortcut: "L" },
  { label: "Send message", href: "/inbox?compose=1", icon: Send, shortcut: "M" },
];

/**
 * plan/03-authorisation.md §3.1 names the command palette alongside the rail
 * as a surface that filters against the caller's permission set. The "Go to"
 * groups below do; the patient and doctor results deliberately do not, since
 * those still come from `lib/data` rather than from a scoped query — Phase
 * 06 is where they start coming from the database and inherit row-level
 * security for free. Until then this palette can offer a patient the caller
 * would not be able to open, which is a Phase 06 defect, not a Phase 03 one.
 */
export function CommandPalette({ permissions }: { permissions: PermissionSet }) {
  const router = useRouter();
  const open = useCareflow((s) => s.commandOpen);
  const setOpen = useCareflow((s) => s.setCommandOpen);
  const patients = useCareflow((s) => s.patients);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useCareflow.getState().commandOpen);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search records or jump to a screen"
      className="top-[18%] translate-y-0 overflow-hidden p-0"
    >
      <CommandInput placeholder="Search patients, doctors, or type a command…" />
      <CommandList className="max-h-[26rem]">
        <CommandEmpty>
          <p className="text-body-sm text-ink">No matches</p>
          <p className="mt-1 text-caption text-ink-3">
            Try a patient name, a patient ID like PT-102938, or a screen name.
          </p>
        </CommandEmpty>

        <CommandGroup heading="Quick actions">
          {quickActions.map((a) => (
            <CommandItem key={a.href} value={`create ${a.label}`} onSelect={() => go(a.href)}>
              <a.icon className="size-4 text-ink-3" strokeWidth={1.9} />
              {a.label}
              <CommandShortcut>C then {a.shortcut}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Patients">
          {patients.slice(0, 40).map((p) => (
            <CommandItem
              key={p.id}
              value={`${p.name} ${p.id} ${departmentName(p.departmentId)}`}
              onSelect={() => go(`/patients/${p.id}`)}
            >
              <PersonAvatar name={p.name} id={p.id} size="xs" initials={p.initials} />
              <span className="truncate">{p.name}</span>
              <span className="text-ident text-ink-3">{p.id}</span>
              <span className="ml-auto flex items-center gap-1.5 text-caption text-ink-3">
                <ToneDot tone={patientStatus[p.status].tone} />
                {departmentName(p.departmentId)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Doctors">
          {doctors.map((d) => (
            <CommandItem
              key={d.id}
              value={`${d.name} ${d.specialty}`}
              onSelect={() => go(`/doctors/${d.id}`)}
            >
              <Stethoscope className="size-4 text-ink-3" strokeWidth={1.9} />
              <span className="truncate">{d.name}</span>
              <span className="ml-auto truncate text-caption text-ink-3">
                {d.specialty}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {visibleNavigation(permissions).map((section, i) => (
          <CommandGroup key={section.label ?? i} heading={section.label ?? "Go to"}>
            {section.items.map((item) => (
              <CommandItem
                key={item.href}
                value={`go to ${item.label}`}
                onSelect={() => go(item.href)}
              >
                <item.icon className="size-4 text-ink-3" strokeWidth={1.9} />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
