import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Rendered under the title row - filter bars, tabs, scope selectors. */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-h1 text-ink">{title}</h1>
          {description && (
            <p className="mt-1 text-body-sm text-ink-2 measure">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
