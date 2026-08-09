"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { staff } from "@/lib/data/people";
import { departments } from "@/lib/data/constants";
import { useCareflow } from "@/lib/store";
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

const roles = [
  "Hospital Admin",
  "Doctor",
  "Nurse",
  "Receptionist",
  "Patient Relations",
  "Marketing",
  "Billing",
  "Manager",
];

export default function AdminUsersPage() {
  const active = staff.filter((s) => s.status === "active").length;
  const mfa = staff.filter((s) => s.mfaEnabled).length;

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Users & roles"
        description={`${staff.length} accounts · ${active} active · ${mfa} with MFA. Manage access and permissions.`}
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

      <StaffTable data={staff} manage />

      <InviteDialog />
    </div>
  );
}

function InviteDialog() {
  const logAudit = useCareflow((s) => s.logAudit);
  const [email, setEmail] = useState("");

  return (
    <ParamDialog
      title="Invite user"
      description="Send an invitation. They set their own password and MFA on first sign-in."
      submitLabel="Send invite"
      onSubmit={() => {
        if (!email.trim()) {
          toast("Add an email first");
          return false;
        }
        logAudit({ action: "created", resource: "User", resourceId: "u-new", field: "invite", previousValue: null, newValue: email });
        toast("Invitation sent", { description: `${email} will receive a sign-in link.` });
      }}
    >
      <Field label="Full name" htmlFor="iu-name">
        <Input id="iu-name" placeholder="Full name" />
      </Field>
      <Field label="Email" htmlFor="iu-email">
        <Input id="iu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@staurora.example" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" htmlFor="iu-role">
          <Select defaultValue="Receptionist">
            <SelectTrigger id="iu-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Department" htmlFor="iu-dept">
          <Select defaultValue="none">
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
