"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast:
                "!bg-surface !text-ink !border-line !shadow-overlay !rounded-md",
              description: "!text-ink-3",
              actionButton: "!bg-primary !text-primary-fg",
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
