import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Say what to do next, not "nothing here". */
  description: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "py-10" : "py-16",
        className,
      )}
    >
      <span className="mb-3 inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-3">
        <Icon aria-hidden className="size-4.5" strokeWidth={1.75} />
      </span>
      <p className="text-h3 text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-body-sm text-ink-3">{description}</p>
      {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  /** Correlation id staff can quote to support. */
  reference?: string;
  className?: string;
}

export function ErrorState({
  icon: Icon,
  title,
  description,
  action,
  reference,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <span className="mb-3 inline-flex size-9 items-center justify-center rounded-md border border-danger-line bg-danger-soft text-danger">
        <Icon aria-hidden className="size-4.5" strokeWidth={1.75} />
      </span>
      <p className="text-h3 text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-body-sm text-ink-3">{description}</p>
      {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
      {reference && (
        <p className="mt-4 text-ident text-ink-3">Reference {reference}</p>
      )}
    </div>
  );
}
