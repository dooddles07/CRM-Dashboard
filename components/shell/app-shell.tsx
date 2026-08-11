"use client";

import { useCareflow } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Viewer } from "@/lib/server/authz/viewer";
import { AppRail } from "./app-rail";
import { TopBar } from "./top-bar";
import { CommandPalette } from "./command-palette";
import { NotificationDrawer } from "./notification-drawer";
import { ViewerProvider } from "./viewer-context";

/**
 * `viewer` is resolved once per navigation by app/(app)/layout.tsx and
 * threaded down rather than fetched here — plan/03-authorisation.md §3.1's
 * permission set, plus the identity the top bar shows.
 *
 * The shell's own chrome takes it as props: rail, top bar and palette are
 * structural, there are three of them, and their signatures saying what they
 * draw from is worth the drilling. Screens get it from `useViewer()` instead
 * — see ./viewer-context.tsx for why the two mechanisms differ.
 */
export function AppShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const collapsed = useCareflow((s) => s.railCollapsed);

  return (
    <ViewerProvider viewer={viewer}>
      <div className="min-h-svh bg-canvas">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-body-sm focus:font-medium focus:text-primary-fg"
        >
          Skip to content
        </a>

        <AppRail permissions={viewer.permissions} />

        <div
          className={cn(
            "flex min-h-svh flex-col transition-[padding] duration-200 ease-out",
            collapsed ? "lg:pl-[3.75rem]" : "lg:pl-60",
          )}
        >
          <TopBar viewer={viewer} />
          <main id="main" className="flex-1 px-3 py-4 sm:px-4 lg:px-6 lg:py-5">
            {children}
          </main>
        </div>

        <CommandPalette permissions={viewer.permissions} />
        <NotificationDrawer />
      </div>
    </ViewerProvider>
  );
}
