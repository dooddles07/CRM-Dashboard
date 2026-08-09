import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { StatusMeta } from "@/lib/status";
import type { Tone } from "@/lib/types";

const chip = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap font-medium [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        soft: "rounded-sm border px-1.5",
        plain: "rounded-sm",
        solid: "rounded-sm px-1.5 border",
      },
      size: {
        sm: "h-5 text-caption [&>svg]:size-3",
        md: "h-6 text-body-sm px-2 [&>svg]:size-3.5",
      },
      tone: {
        success: "",
        warning: "",
        danger: "",
        info: "",
        ai: "",
        neutral: "",
      },
    },
    compoundVariants: [
      { variant: "soft", tone: "success", class: "bg-success-soft border-success-line text-success" },
      { variant: "soft", tone: "warning", class: "bg-warning-soft border-warning-line text-warning" },
      { variant: "soft", tone: "danger", class: "bg-danger-soft border-danger-line text-danger" },
      { variant: "soft", tone: "info", class: "bg-info-soft border-info-line text-info" },
      { variant: "soft", tone: "ai", class: "bg-ai-soft border-ai-line text-ai" },
      { variant: "soft", tone: "neutral", class: "bg-neutral-soft border-neutral-line text-neutral" },

      { variant: "plain", tone: "success", class: "text-success" },
      { variant: "plain", tone: "warning", class: "text-warning" },
      { variant: "plain", tone: "danger", class: "text-danger" },
      { variant: "plain", tone: "info", class: "text-info" },
      { variant: "plain", tone: "ai", class: "text-ai" },
      { variant: "plain", tone: "neutral", class: "text-ink-2" },

      { variant: "solid", tone: "success", class: "bg-success border-success text-ink-inverse" },
      { variant: "solid", tone: "warning", class: "bg-warning border-warning text-ink-inverse" },
      { variant: "solid", tone: "danger", class: "bg-danger border-danger text-ink-inverse" },
      { variant: "solid", tone: "info", class: "bg-info border-info text-ink-inverse" },
      { variant: "solid", tone: "ai", class: "bg-ai border-ai text-ink-inverse" },
      { variant: "solid", tone: "neutral", class: "bg-neutral border-neutral text-ink-inverse" },
    ],
    defaultVariants: { variant: "soft", size: "sm", tone: "neutral" },
  },
);

interface StatusChipProps
  extends Omit<VariantProps<typeof chip>, "tone">,
    React.HTMLAttributes<HTMLSpanElement> {
  /** Resolved status from the registry in lib/status.ts. */
  meta: StatusMeta;
  /** Override the registry tone (rare - trend chips do this). */
  tone?: Tone;
  showIcon?: boolean;
  label?: string;
}

/**
 * Status is always three-channel: icon, label, colour. Colour alone never
 * carries the meaning, so the chip reads correctly in greyscale and for
 * colour-blind users.
 */
export function StatusChip({
  meta,
  tone,
  variant,
  size,
  showIcon = true,
  label,
  className,
  ...props
}: StatusChipProps) {
  const Icon = meta.icon;
  return (
    <span
      className={cn(chip({ variant, size, tone: tone ?? meta.tone }), className)}
      {...props}
    >
      {showIcon && <Icon aria-hidden strokeWidth={2.25} />}
      {label ?? meta.label}
    </span>
  );
}

/** A bare tone dot for legends and dense list rows. Always paired with text. */
export function ToneDot({ tone, className }: { tone: Tone; className?: string }) {
  const fill: Record<Tone, string> = {
    success: "bg-success-solid",
    warning: "bg-warning-solid",
    danger: "bg-danger-solid",
    info: "bg-info-solid",
    ai: "bg-ai-solid",
    neutral: "bg-neutral-solid",
  };
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", fill[tone], className)}
    />
  );
}
