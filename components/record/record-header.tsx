"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RecordTab {
  id: string;
  label: string;
  count?: number;
}

export interface RecordFact {
  label: string;
  value: React.ReactNode;
}

interface RecordHeaderProps {
  breadcrumb: { label: string; href: string };
  avatar: React.ReactNode;
  title: string;
  identifier: string;
  chips?: React.ReactNode;
  facts: RecordFact[];
  actions: React.ReactNode;
  tabs: RecordTab[];
  activeTab: string;
}

/**
 * One anatomy for every entity detail screen: identity, status, the facts you
 * need before acting, the actions, then the tabs. Learn it on a patient and
 * you already know the doctor, lead, and case screens.
 */
export function RecordHeader({
  breadcrumb,
  avatar,
  title,
  identifier,
  chips,
  facts,
  actions,
  tabs,
  activeTab,
}: RecordHeaderProps) {
  const pathname = usePathname();
  const params = useSearchParams();

  function tabHref(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id === tabs[0].id) next.delete("tab");
    else next.set("tab", id);
    const q = next.toString();
    return q ? `${pathname}?${q}` : pathname;
  }

  return (
    <header className="mb-4">
      <nav aria-label="Breadcrumb" className="mb-2.5">
        <ol className="flex items-center gap-1 text-body-sm text-ink-3">
          <li>
            <Link href={breadcrumb.href} className="hover:text-ink">
              {breadcrumb.label}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" strokeWidth={2} />
          </li>
          <li aria-current="page" className="truncate text-ink">
            {title}
          </li>
        </ol>
      </nav>

      <div className="rounded-lg border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-4 pt-4">
          <div className="flex min-w-0 items-start gap-3">
            {avatar}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="text-h1 text-ink">{title}</h1>
                {chips}
              </div>
              <p className="mt-1 text-ident text-ink-3">{identifier}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>

        {facts.length > 0 && (
          <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-line px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-label text-ink-3">{f.label}</dt>
                <dd className="mt-0.5 truncate text-body-sm text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="overflow-x-auto border-t border-line">
          <div role="tablist" aria-label="Record sections" className="flex min-w-max px-2">
            {tabs.map((t) => {
              const active = t.id === activeTab;
              return (
                <Link
                  key={t.id}
                  href={tabHref(t.id)}
                  scroll={false}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-body-sm transition-colors duration-150",
                    active
                      ? "font-medium text-ink"
                      : "text-ink-3 hover:text-ink",
                  )}
                >
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span
                      className={cn(
                        "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold tabular-nums",
                        active
                          ? "bg-primary-soft text-primary-soft-fg"
                          : "bg-surface-3 text-ink-3",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
