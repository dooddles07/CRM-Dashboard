import { cn } from "@/lib/utils";

/** The single card surface used across the product. Never nested inside itself. */
export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface shadow-card",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface PanelHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
  ...props
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-line px-4 py-3",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="text-h3 text-ink">{title}</h2>
        {description && (
          <p className="mt-0.5 text-body-sm text-ink-3">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function PanelFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-line px-4 py-2.5",
        className,
      )}
      {...props}
    />
  );
}
