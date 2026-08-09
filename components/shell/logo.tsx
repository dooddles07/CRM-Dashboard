import { cn } from "@/lib/utils";

/**
 * Authored mark: a pulse trace inside a solid tile. The hospital's own
 * vernacular, drawn rather than borrowed from an icon set.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none">
        <path
          d="M3 13h3.2l2-6.2 3.4 12L14 13h7"
          stroke="var(--primary-fg)"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col leading-none", className)}>
      <span className="truncate text-body font-semibold tracking-[-0.012em] text-rail-fg">
        CareFlow
      </span>
      <span className="mt-0.5 truncate text-[0.6875rem] leading-none text-rail-fg-muted">
        St. Aurora Medical Center
      </span>
    </span>
  );
}
