"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Integration } from "@/lib/types";
import { integrations } from "@/lib/data/marketing";
import { integrationStatus } from "@/lib/status";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/data/page-header";
import { StatusChip } from "@/components/healthcare/status-chip";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const CATEGORIES: Integration["category"][] = [
  "Hospital systems",
  "Communication",
  "Marketing",
  "Payments",
  "Developer",
];

export default function IntegrationsPage() {
  const [connected, setConnected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(integrations.map((i) => [i.id, i.status === "connected"])),
  );

  const connectedCount = Object.values(connected).filter(Boolean).length;

  function toggle(i: Integration) {
    setConnected((c) => {
      const next = !c[i.id];
      toast(next ? `${i.name} connected` : `${i.name} disconnected`, {
        description: next ? "Data will begin syncing shortly." : "Syncing has stopped.",
      });
      return { ...c, [i.id]: next };
    });
  }

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Integrations"
        description={`Connect CareFlow to the systems around it · ${connectedCount} of ${integrations.length} connected.`}
      />

      <div className="space-y-6">
        {CATEGORIES.map((category) => {
          const items = integrations.filter((i) => i.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="mb-2 text-label text-ink-3">{category}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((i) => {
                  const isConnected = connected[i.id];
                  const meta = isConnected
                    ? integrationStatus.connected
                    : i.status === "error" && !isConnected
                      ? integrationStatus.disconnected
                      : integrationStatus[i.status];
                  return (
                    <div key={i.id} className="flex flex-col rounded-lg border border-line bg-surface p-4 shadow-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            aria-hidden
                            className={cn(
                              "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-xl",
                            )}
                          >
                            {i.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{i.name}</p>
                            <StatusChip meta={meta} className="mt-1" />
                          </div>
                        </div>
                        <Switch
                          checked={isConnected}
                          onCheckedChange={() => toggle(i)}
                          aria-label={`${isConnected ? "Disconnect" : "Connect"} ${i.name}`}
                        />
                      </div>
                      <p className="mt-3 text-body-sm text-ink-3">{i.description}</p>
                      <p className="mt-3 border-t border-line pt-2 text-caption text-ink-3">
                        {isConnected
                          ? i.lastSync
                            ? `Last synced ${relativeTime(i.lastSync)}`
                            : "Syncing…"
                          : "Not connected"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
