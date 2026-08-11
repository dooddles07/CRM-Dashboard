import { ResetPasswordClient } from "./reset-password-client";

/** task-4-brief.md §5. New screen — reuses the `(auth)` layout, no new design work. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordClient token={token ?? null} />;
}
