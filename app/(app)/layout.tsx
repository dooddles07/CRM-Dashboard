import { AppShell } from "@/components/shell/app-shell";

// Every screen is an interactive, client-rendered dashboard that reads URL state
// (?create=, ?tab=) and in-memory session state, so the segment renders on demand
// rather than being statically prerendered.
export const dynamic = "force-dynamic";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
