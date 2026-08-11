"use client";

import { createContext, useContext, useEffect } from "react";
import { useCareflow } from "@/lib/store";
import type { Viewer } from "@/lib/server/authz/viewer";

const ViewerContext = createContext<Viewer | null>(null);

/**
 * The signed-in person, available to any screen under app/(app)/.
 *
 * Resolved once per navigation on the server (app/(app)/layout.tsx) and put
 * here rather than fetched, so no screen makes a request for it and every
 * screen sees the same answer. The shell's own chrome — rail, top bar,
 * palette — takes it as props instead: those three are structural and it is
 * worth their signatures saying what they draw from. Screens are leaves at
 * arbitrary depth, and threading a prop through 37 of them to reach a
 * greeting would be worse than this.
 *
 * `viewer.permissions` is for deciding what to draw. plan/03-authorisation.md
 * §3.1 and docs/SECURITY.md §3.2: "UI hiding stays as a courtesy. A hidden
 * button is not an access control." Every action a screen offers is checked
 * again on the server, by the service that performs it, against the session
 * rather than against anything read from here.
 */
export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: Viewer;
  children: React.ReactNode;
}) {
  const setActor = useCareflow((s) => s.setActor);

  // The demo store's in-memory audit writer used to attribute every entry to
  // a hardcoded staff member. Handing it the real signed-in identity is the
  // smallest fix that stops the audit trail naming the wrong person; Phase 04
  // replaces the writer itself with a database transaction.
  useEffect(() => {
    setActor({ id: viewer.staffId, name: viewer.name });
  }, [setActor, viewer.staffId, viewer.name]);

  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

/**
 * Throws outside the provider rather than returning null. Every consumer
 * lives under app/(app)/layout.tsx, which redirects to /login when there is
 * no session — so "no viewer" is a wiring mistake, and a component silently
 * rendering a blank name is exactly the kind of quiet failure Phase 03 is
 * otherwise spent designing against.
 */
export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) {
    throw new Error("useViewer() was called outside <ViewerProvider>. It requires the (app) layout.");
  }
  return viewer;
}
