import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { currentViewer } from "@/lib/server/authz/viewer";

// Every screen is an interactive, client-rendered dashboard that reads URL state
// (?create=, ?tab=) and in-memory session state, so the segment renders on demand
// rather than being statically prerendered.
export const dynamic = "force-dynamic";

/**
 * plan/02-authentication.md §4.1's second layer. proxy.ts redirects
 * unauthenticated requests before they reach here, but "a matcher typo is a
 * silent hole and a missing function argument is a compile error" — this
 * call is the one that runs for every `(app)` route regardless of what the
 * matcher says.
 *
 * It is also where plan/03-authorisation.md §3.1's permission set enters the
 * UI: resolved once per navigation, on the server, and handed down as props.
 * Every screen under this layout can therefore draw the right affordances
 * without any of them fetching anything, and none of them is trusted to
 * enforce.
 */
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");

  return <AppShell viewer={viewer}>{children}</AppShell>;
}
