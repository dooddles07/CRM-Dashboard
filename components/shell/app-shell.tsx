"use client";

import { useCareflow } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AppRail } from "./app-rail";
import { TopBar } from "./top-bar";
import { CommandPalette } from "./command-palette";
import { NotificationDrawer } from "./notification-drawer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useCareflow((s) => s.railCollapsed);

  return (
    <div className="min-h-svh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-body-sm focus:font-medium focus:text-primary-fg"
      >
        Skip to content
      </a>

      <AppRail />

      <div
        className={cn(
          "flex min-h-svh flex-col transition-[padding] duration-200 ease-out",
          collapsed ? "lg:pl-[3.75rem]" : "lg:pl-60",
        )}
      >
        <TopBar />
        <main id="main" className="flex-1 px-3 py-4 sm:px-4 lg:px-6 lg:py-5">
          {children}
        </main>
      </div>

      <CommandPalette />
      <NotificationDrawer />
    </div>
  );
}
