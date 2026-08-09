"use client";

import Link from "next/link";
import { UserCog } from "lucide-react";
import { staff } from "@/lib/data/people";
import { PageHeader } from "@/components/data/page-header";
import { StaffTable } from "@/components/shared/staff-table";
import { Button } from "@/components/ui/button";

export default function StaffPage() {
  const active = staff.filter((s) => s.status === "active").length;

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Staff"
        description={`The people who run the hospital's operations · ${active} active of ${staff.length}.`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/users">
              <UserCog className="size-3.5" strokeWidth={2} />
              Manage users & roles
            </Link>
          </Button>
        }
      />
      <StaffTable data={staff} />
    </div>
  );
}
