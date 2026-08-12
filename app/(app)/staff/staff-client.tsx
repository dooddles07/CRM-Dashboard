"use client";

import Link from "next/link";
import { UserCog } from "lucide-react";
import type { StaffDTO } from "@/lib/server/services/directory";
import { PageHeader } from "@/components/data/page-header";
import { StaffTable } from "@/components/shared/staff-table";
import { Button } from "@/components/ui/button";

/**
 * plan/06-screen-migration.md §5. Thirty lines before the migration and
 * thirty after — the body did not change, only where `data` comes from.
 */
export function StaffClient({ rows, activeCount }: { rows: StaffDTO[]; activeCount: number }) {
  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Staff"
        description={`The people who run the hospital's operations · ${activeCount} active of ${rows.length}.`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/users">
              <UserCog className="size-3.5" strokeWidth={2} />
              Manage users & roles
            </Link>
          </Button>
        }
      />
      <StaffTable data={rows} />
    </div>
  );
}
