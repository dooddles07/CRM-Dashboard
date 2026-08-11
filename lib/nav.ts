import {
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Contact,
  FileText,
  Handshake,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  MessageSquareWarning,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Timer,
  UserCog,
  Users,
  Waypoints,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { LEVELS, type Area, type Capability } from "@/lib/server/authz/matrix";
import type { PermissionSet } from "@/lib/server/authz/policy";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Count shown on the rail. Only for work that is genuinely owed. */
  badge?: number;
  badgeTone?: "danger" | "warning" | "info";
  /** Also mark the parent active when on these paths. */
  match?: string[];
  /**
   * The area whose `view` level this destination needs, per
   * plan/03-authorisation.md §3.1. Omitted means every signed-in role sees
   * it — the dashboard, and the three directory screens plan §5.2 calls
   * "readable by all authenticated roles".
   */
  area?: Area;
  /** A capability the destination needs instead of an area. Only `/admin/audit` uses one. */
  capability?: Capability;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Which area governs each destination follows the same mapping
 * drizzle/manual/0007_row_level_security.sql §4 uses for the tables behind
 * them — including its one judgement call, that the Engagement and
 * Experience screens have no area of their own and take `patients`, since
 * what they show is a patient's record.
 *
 * Dashboard and the three Operations screens carry no area on purpose: the
 * dashboard is a summary of whatever the caller can already see, and
 * departments/doctors/staff are the directory, "readable by all
 * authenticated roles" (plan §5.2).
 */
export const navigation: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Patients", href: "/patients", icon: Users, area: "patients" },
      { label: "Appointments", href: "/appointments", icon: CalendarDays, area: "appointments" },
      { label: "Calendar", href: "/appointments/calendar", icon: CalendarRange, area: "appointments" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { label: "Leads", href: "/leads", icon: Waypoints, badge: 12, badgeTone: "info", area: "pipeline" },
      { label: "Referrals", href: "/referrals", icon: Handshake, area: "pipeline" },
      { label: "Follow-ups", href: "/follow-ups", icon: Timer, badge: 5, badgeTone: "danger", area: "pipeline" },
      { label: "Tasks", href: "/tasks", icon: ClipboardList, badge: 8, badgeTone: "warning", area: "pipeline" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { label: "Inbox", href: "/inbox", icon: MessageSquare, badge: 4, badgeTone: "info", area: "patients" },
      { label: "Campaigns", href: "/campaigns", icon: Megaphone, area: "pipeline" },
    ],
  },
  {
    label: "Experience",
    items: [
      { label: "Feedback", href: "/feedback", icon: Star, area: "patients" },
      {
        label: "Complaints",
        href: "/complaints",
        icon: MessageSquareWarning,
        badge: 2,
        badgeTone: "danger",
        area: "patients",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Doctors", href: "/doctors", icon: Stethoscope },
      { label: "Departments", href: "/departments", icon: Building2 },
      { label: "Staff", href: "/staff", icon: Contact },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3, area: "reports" },
      { label: "Reports", href: "/reports", icon: FileText, area: "reports" },
      { label: "CareFlow AI", href: "/ai", icon: Sparkles, area: "reports" },
    ],
  },
  {
    label: "Automation",
    items: [
      { label: "Workflows", href: "/automations", icon: Workflow, area: "pipeline" },
      { label: "Integrations", href: "/integrations", icon: Plug, area: "settings" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users & roles", href: "/admin/users", icon: UserCog, match: ["/admin/roles"], area: "users" },
      { label: "Audit logs", href: "/admin/audit", icon: ScrollText, capability: "audit:read" },
      { label: "Security", href: "/admin/security", icon: ShieldCheck, area: "settings" },
      { label: "Settings", href: "/settings", icon: Settings, area: "settings" },
    ],
  },
];

/**
 * plan/03-authorisation.md §3.1: "`/me` returns the caller's permission set,
 * and the rail, command palette, and row menus filter against it. That
 * prevents a Nurse being shown a Settings link that 403s."
 *
 * And the sentence after it, which matters more: "The server enforces
 * regardless, and nothing in the UI is trusted." This function decides what
 * to *draw*. It is not an access control, and no server-side decision
 * anywhere may be derived from it — docs/SECURITY.md §3.2, "a hidden button
 * is not an access control".
 */
export function permits(permissions: PermissionSet, item: NavItem): boolean {
  if (item.capability && !permissions.capabilities.includes(item.capability)) return false;
  if (!item.area) return true;
  return LEVELS.indexOf(permissions.areas[item.area]) >= LEVELS.indexOf("view");
}

/** `navigation`, minus what this caller cannot reach. Sections that empty out are dropped. */
export function visibleNavigation(permissions: PermissionSet): NavSection[] {
  return navigation
    .map((section) => ({ ...section, items: section.items.filter((item) => permits(permissions, item)) }))
    .filter((section) => section.items.length > 0);
}

export const allNavItems = navigation.flatMap((s) => s.items);

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href) return true;
  if (item.match?.some((m) => pathname.startsWith(m))) return true;
  // /appointments must not light up while on /appointments/calendar.
  const sibling = allNavItems.some(
    (other) => other.href !== item.href && other.href.startsWith(`${item.href}/`) && pathname.startsWith(other.href),
  );
  return !sibling && pathname.startsWith(`${item.href}/`);
}
