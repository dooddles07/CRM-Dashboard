"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { StaffDTO } from "@/lib/server/services/directory";
import { inviteUser } from "@/app/actions/users";
import { PageHeader } from "@/components/data/page-header";
import { StaffTable } from "@/components/shared/staff-table";
import { ParamDialog, Field } from "@/components/shared/create-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES } from "@/lib/server/authz/matrix";

interface UsersClientProps {
  rows: StaffDTO[];
  departments: { id: string; name: string }[];
}

export function UsersClient({ rows, departments }: UsersClientProps) {
  const active = rows.filter((s) => s.status === "active").length;
  const mfa = rows.filter((s) => s.mfaEnabled).length;

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Users & roles"
        description={`${rows.length} accounts · ${active} active · ${mfa} with MFA. Manage access and permissions.`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/roles">
                <ShieldCheck className="size-3.5" strokeWidth={2} />
                Roles & permissions
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/admin/users?create=1">
                <UserPlus className="size-3.5" strokeWidth={2.25} />
                Invite user
              </Link>
            </Button>
          </>
        }
      />

      <StaffTable data={rows} manage />

      <InviteDialog departments={departments} />
    </div>
  );
}

/**
 * plan/02-authentication.md §6.2's invite flow, finally connected.
 *
 * Before this the dialog wrote a client-side audit entry and showed a toast;
 * no invitation existed and nobody could accept one. It now calls
 * `createInvitation` through a Server Action, which mints a single-use token,
 * delivers the link through the sandbox outbound log, and writes a real audit
 * entry naming who invited whom into what role.
 *
 * The name field is gone: the invitee sets their own name when they accept,
 * so collecting it here would have produced a value the system discards.
 */
function InviteDialog({ departments }: { departments: { id: string; name: string }[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("Receptionist");
  const [departmentId, setDepartmentId] = useState("none");
  const [pending, startTransition] = useTransition();

  return (
    <ParamDialog
      title="Invite user"
      description="Send an invitation. They set their own name, password and MFA on first sign-in."
      submitLabel={pending ? "Sending…" : "Send invite"}
      onSubmit={() => {
        if (!email.trim()) {
          toast("Add an email first");
          return false;
        }
        startTransition(async () => {
          const result = await inviteUser({
            email,
            role,
            departmentId: departmentId === "none" ? null : departmentId,
          });
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          setEmail("");
          toast("Invitation sent", {
            description: `${result.email} can accept until ${new Date(result.expiresAt).toLocaleDateString()}.`,
          });
        });
      }}
    >
      <Field label="Email" htmlFor="iu-email">
        <Input
          id="iu-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@staurora.example"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" htmlFor="iu-role">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="iu-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* The nine roles from the matrix, not a hand-kept list. */}
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Department" htmlFor="iu-dept">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger id="iu-dept" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Hospital-wide</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </ParamDialog>
  );
}
