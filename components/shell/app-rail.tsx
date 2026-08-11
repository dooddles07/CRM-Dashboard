"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { isActive, visibleNavigation, type NavItem } from "@/lib/nav";
import type { PermissionSet } from "@/lib/server/authz/policy";
import { useCareflow } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Logo, Wordmark } from "./logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const badgeTone = {
  danger: "bg-danger-solid text-white",
  warning: "bg-warning-solid text-on-amber",
  info: "bg-info-solid text-white",
} as const;

function RailLink({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md text-body-sm transition-colors duration-150",
        collapsed ? "w-9 justify-center px-0" : "px-2.5",
        active
          ? "bg-rail-active font-medium text-rail-fg"
          : "text-rail-fg-muted hover:bg-rail-hover hover:text-rail-fg",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={active ? 2.25 : 1.9} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {item.badge !== undefined &&
        (collapsed ? (
          <span
            aria-hidden
            className={cn(
              "absolute right-1 top-1 size-1.5 rounded-full",
              badgeTone[item.badgeTone ?? "info"],
            )}
          />
        ) : (
          <span
            className={cn(
              "ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold tabular-nums",
              badgeTone[item.badgeTone ?? "info"],
            )}
          >
            {item.badge}
          </span>
        ))}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {item.label}
        {item.badge !== undefined && (
          <span className="text-ink-3 tabular-nums">{item.badge}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function RailContent({
  permissions,
  collapsed = false,
  onNavigate,
}: {
  permissions: PermissionSet;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const toggleRail = useCareflow((s) => s.toggleRail);
  // plan/03-authorisation.md §3.1: "That prevents a Nurse being shown a
  // Settings link that 403s." A courtesy, not a control — the route itself
  // still checks, and a section that empties out disappears with it.
  const sections = visibleNavigation(permissions);

  return (
    <div className="flex h-full flex-col border-r border-rail-line bg-rail">
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-rail-line",
          collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        )}
      >
        <Logo />
        {!collapsed && <Wordmark />}
      </div>

      <nav
        aria-label="Main"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3"
      >
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={i > 0 ? "mt-4" : undefined}>
            {section.label &&
              (collapsed ? (
                <div
                  aria-hidden
                  className="mx-auto mb-2 h-px w-5 bg-rail-line"
                />
              ) : (
                <p className="mb-1 px-2.5 text-label text-rail-fg-muted/85">
                  {section.label}
                </p>
              ))}
            <ul className={cn("space-y-0.5", collapsed && "flex flex-col items-center")}>
              {section.items.map((item) => (
                <li key={item.href}>
                  <RailLink
                    item={item}
                    collapsed={collapsed}
                    active={isActive(pathname, item)}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-rail-line p-2",
          collapsed && "flex justify-center",
        )}
      >
        <button
          type="button"
          onClick={toggleRail}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md text-body-sm text-rail-fg-muted transition-colors duration-150 hover:bg-rail-hover hover:text-rail-fg cursor-pointer",
            collapsed ? "w-9 justify-center" : "w-full px-2.5",
          )}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? (
            <PanelLeft aria-hidden className="size-4" strokeWidth={1.9} />
          ) : (
            <>
              <PanelLeftClose aria-hidden className="size-4" strokeWidth={1.9} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function AppRail({ permissions }: { permissions: PermissionSet }) {
  const collapsed = useCareflow((s) => s.railCollapsed);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden shrink-0 transition-[width] duration-200 ease-out lg:block",
        collapsed ? "w-[3.75rem]" : "w-60",
      )}
    >
      <RailContent permissions={permissions} collapsed={collapsed} />
    </aside>
  );
}
