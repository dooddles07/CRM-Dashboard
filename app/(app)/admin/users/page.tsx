import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import { assert } from "@/lib/server/authz/policy";
import * as directory from "@/lib/server/services/directory";
import { TableSkeleton } from "@/components/data/skeletons";
import { UsersClient } from "./users-client";

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
      <UsersData />
    </Suspense>
  );
}

async function UsersData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  // The directory itself is readable by everyone, but this screen manages
  // accounts, so it needs the `users` area — Manager can view, only Hospital
  // Admin and Super Admin can act. The invite action asserts `edit` again.
  assert(authed.authz, "users", "view");

  const [staff, departmentList] = await Promise.all([
    directory.listStaff(authed.authz, { perPage: 100 }),
    directory.listDepartments(authed.authz),
  ]);

  return (
    <UsersClient
      rows={staff.data}
      departments={departmentList.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
