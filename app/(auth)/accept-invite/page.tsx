import { AcceptInviteClient } from "./accept-invite-client";

/** task-4-brief.md §6. New screen — reuses the `(auth)` layout, no new design work. */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <AcceptInviteClient token={token ?? null} />;
}
