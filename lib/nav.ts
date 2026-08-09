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

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Count shown on the rail. Only for work that is genuinely owed. */
  badge?: number;
  badgeTone?: "danger" | "warning" | "info";
  /** Also mark the parent active when on these paths. */
  match?: string[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Patients", href: "/patients", icon: Users },
      { label: "Appointments", href: "/appointments", icon: CalendarDays },
      { label: "Calendar", href: "/appointments/calendar", icon: CalendarRange },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { label: "Leads", href: "/leads", icon: Waypoints, badge: 12, badgeTone: "info" },
      { label: "Referrals", href: "/referrals", icon: Handshake },
      { label: "Follow-ups", href: "/follow-ups", icon: Timer, badge: 5, badgeTone: "danger" },
      { label: "Tasks", href: "/tasks", icon: ClipboardList, badge: 8, badgeTone: "warning" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { label: "Inbox", href: "/inbox", icon: MessageSquare, badge: 4, badgeTone: "info" },
      { label: "Campaigns", href: "/campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Experience",
    items: [
      { label: "Feedback", href: "/feedback", icon: Star },
      {
        label: "Complaints",
        href: "/complaints",
        icon: MessageSquareWarning,
        badge: 2,
        badgeTone: "danger",
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
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Reports", href: "/reports", icon: FileText },
      { label: "CareFlow AI", href: "/ai", icon: Sparkles },
    ],
  },
  {
    label: "Automation",
    items: [
      { label: "Workflows", href: "/automations", icon: Workflow },
      { label: "Integrations", href: "/integrations", icon: Plug },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users & roles", href: "/admin/users", icon: UserCog, match: ["/admin/roles"] },
      { label: "Audit logs", href: "/admin/audit", icon: ScrollText },
      { label: "Security", href: "/admin/security", icon: ShieldCheck },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

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
