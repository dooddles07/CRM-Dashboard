"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Bell,
  CalendarPlus,
  Check,
  ChevronDown,
  ClipboardList,
  Handshake,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  Timer,
  UserPlus,
  Waypoints,
} from "lucide-react";
import { CURRENT_USER, HOSPITAL } from "@/lib/data/constants";
import { useIsClient } from "@/lib/hooks";
import { useCareflow, useUnreadCount } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/healthcare/person-avatar";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RailContent } from "./app-rail";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const createActions = [
  { label: "New patient", href: "/patients/new", icon: UserPlus },
  { label: "New appointment", href: "/appointments?create=1", icon: CalendarPlus },
  { label: "New lead", href: "/leads?create=1", icon: Waypoints },
  { label: "New task", href: "/tasks?create=1", icon: ClipboardList },
  { label: "New follow-up", href: "/follow-ups?create=1", icon: Timer },
  { label: "New referral", href: "/referrals?create=1", icon: Handshake },
  { label: "Send message", href: "/inbox?compose=1", icon: Send },
];

function useShortcutKey() {
  const isClient = useIsClient();
  return isClient && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsClient();

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "Match system", icon: Monitor },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-ink-2 hover:text-ink"
          aria-label="Change theme"
        >
          {mounted && theme === "dark" ? (
            <Moon className="size-4" strokeWidth={1.9} />
          ) : (
            <Sun className="size-4" strokeWidth={1.9} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => setTheme(o.value)}>
            <o.icon className="size-4" strokeWidth={1.9} />
            {o.label}
            {mounted && theme === o.value && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  const setCommandOpen = useCareflow((s) => s.setCommandOpen);
  const setNotificationsOpen = useCareflow((s) => s.setNotificationsOpen);
  const unread = useUnreadCount();
  const shortcut = useShortcutKey();
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur-sm sm:px-4">
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4.5" strokeWidth={1.9} />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 border-rail-line bg-rail p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <RailContent onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className={cn(
          "group flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5",
          "text-body-sm text-ink-3 transition-colors duration-150 cursor-pointer",
          "hover:border-line-strong hover:bg-surface md:max-w-sm",
        )}
      >
        <Search aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
        <span className="truncate">
          <span className="hidden sm:inline">Search patients, appointments, leads…</span>
          <span className="sm:hidden">Search</span>
        </span>
        <kbd className="ml-auto hidden shrink-0 items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[0.6875rem] font-medium text-ink-3 sm:inline-flex">
          <span>{shortcut}</span>
          <span>K</span>
        </kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-8 gap-1 px-2.5 sm:px-3">
              <Plus className="size-3.5" strokeWidth={2.5} />
              <span className="hidden sm:inline">Create</span>
              <ChevronDown className="size-3 opacity-70" strokeWidth={2.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {createActions.map((a) => (
              <DropdownMenuItem key={a.href} asChild>
                <Link href={a.href}>
                  <a.icon className="size-4" strokeWidth={1.9} />
                  {a.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeMenu />

        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 text-ink-2 hover:text-ink"
          onClick={() => setNotificationsOpen(true)}
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications, none unread"
          }
        >
          <Bell className="size-4" strokeWidth={1.9} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-danger-solid text-[0.5625rem] font-bold text-white tabular-nums ring-2 ring-surface">
              {unread}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-0.5 flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5 transition-colors duration-150 hover:bg-surface-2 cursor-pointer"
              aria-label="Account menu"
            >
              <span className="relative">
                <PersonAvatar
                  name={CURRENT_USER.name}
                  id={CURRENT_USER.id}
                  size="sm"
                  initials={CURRENT_USER.initials}
                />
                <span
                  aria-hidden
                  className="absolute -bottom-px -right-px size-2.5 rounded-full bg-success-solid ring-2 ring-surface"
                />
              </span>
              <ChevronDown className="size-3 text-ink-3" strokeWidth={2.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="text-body-sm font-semibold text-ink">{CURRENT_USER.name}</p>
              <p className="mt-0.5 text-caption text-ink-3">
                {CURRENT_USER.role} · {HOSPITAL.shortName}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-caption text-success">
                <span aria-hidden className="size-1.5 rounded-full bg-success-solid" />
                Online
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <PersonAvatar
                  name={CURRENT_USER.name}
                  id={CURRENT_USER.id}
                  size="xs"
                  initials={CURRENT_USER.initials}
                />
                Profile & preferences
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/security">
                <ShieldCheck className="size-4" strokeWidth={1.9} />
                Security
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4" strokeWidth={1.9} />
                Organisation settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/login">
                <LogOut className="size-4" strokeWidth={1.9} />
                Sign out
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
