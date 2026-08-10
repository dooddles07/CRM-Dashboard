const DOT = "•";

export type ProtectedKind = "phone" | "email" | "address" | "dob" | "id" | "text";

/**
 * Masking is presentational only. In a real deployment the server would never
 * send the full value until the reveal is authorised and recorded.
 */
export function mask(value: string, kind: ProtectedKind): string {
  switch (kind) {
    case "phone": {
      const digits = value.replace(/\D/g, "");
      const tail = digits.slice(-2);
      const cc = value.startsWith("+") ? value.slice(0, 3) : "";
      return `${cc} ${DOT.repeat(3)} ${DOT.repeat(3)} ${DOT.repeat(2)}${tail}`.trim();
    }
    case "email": {
      const [local = "", domain = ""] = value.split("@");
      const tld = domain.includes(".") ? domain.slice(domain.lastIndexOf(".")) : "";
      return `${local.slice(0, 2)}${DOT.repeat(6)}@${DOT.repeat(6)}${tld}`;
    }
    case "address": {
      // Keep the city so staff can still route and triage; hide the street.
      const parts = value.split(",").map((p) => p.trim());
      const city = parts.length > 1 ? parts[parts.length - 1] : "";
      return city ? `${DOT.repeat(10)}, ${city}` : DOT.repeat(12);
    }
    case "dob": {
      const year = value.slice(0, 4);
      return `${DOT.repeat(2)} ${DOT.repeat(3)} ${year}`;
    }
    case "id":
      return `${value.slice(0, 3)}${DOT.repeat(6)}`;
    default:
      return DOT.repeat(Math.min(value.length, 10));
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parse(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
}

/** "12 Aug 2026" */
export function formatDate(iso: string): string {
  const d = parse(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 Aug" - for dense tables where the year is implied */
export function formatDateShort(iso: string): string {
  const d = parse(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "09:30" */
export function formatTime(iso: string): string {
  const d = parse(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDayName(iso: string): string {
  return DAYS[parse(iso).getDay()];
}

/**
 * Days between an ISO date and `reference`. Negative is in the past.
 *
 * plan/01-foundation.md §7.3: this used to compare against the frozen demo
 * clock (TODAY), which only looked right by coincidence on the day it was
 * authored. `reference` now defaults to the real wall clock instead — once
 * Phase 06 splits pages into a server shell, the server passes request time
 * explicitly here rather than relying on the default.
 */
export function daysFromToday(iso: string, reference: string = new Date().toISOString()): number {
  const a = parse(iso.slice(0, 10)).getTime();
  const b = parse(reference.slice(0, 10)).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** "Today", "Yesterday", "In 3 days", "9 days ago" */
export function relativeDay(iso: string, reference?: string): string {
  const diff = daysFromToday(iso, reference);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/** Compact relative timestamp for feeds: "2h ago", "Yesterday 16:04" */
export function relativeTime(iso: string, reference?: string): string {
  const diff = daysFromToday(iso, reference);
  if (diff === 0) return formatTime(iso);
  if (diff === -1) return `Yesterday ${formatTime(iso)}`;
  return `${formatDateShort(iso)} ${formatTime(iso)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function formatSignedPercent(n: number, digits = 1): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function formatCurrency(n: number): string {
  return `₱${n.toLocaleString("en-US")}`;
}

export function initialsOf(name: string): string {
  return name
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
