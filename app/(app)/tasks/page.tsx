import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/session";
import * as tasks from "@/lib/server/services/tasks";
import * as directory from "@/lib/server/services/directory";
import { TableSkeleton } from "@/components/data/skeletons";
import { TasksClient } from "./tasks-client";

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} columns={6} />}>
      <TasksData />
    </Suspense>
  );
}

async function TasksData() {
  const authed = await requireSession();
  if (!authed) redirect("/login");

  const [page, staff] = await Promise.all([
    tasks.list(authed.authz, { perPage: 100 }),
    directory.listStaff(authed.authz, { perPage: 100 }),
  ]);

  return <TasksClient tasks={page.data} staff={staff.data} />;
}
