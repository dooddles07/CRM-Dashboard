"use client";

import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCareflow, revealKey } from "@/lib/store";
import { mask, type ProtectedKind } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ProtectedProps {
  value: string;
  kind: ProtectedKind;
  /** What the audit entry will name, e.g. "Patient" / "PT-102938" / "Mobile number". */
  resource: string;
  resourceId: string;
  field: string;
  className?: string;
  /** Renders the value in the identifier face. */
  mono?: boolean;
}

/**
 * Patient contact details stay masked until someone deliberately reveals them,
 * and every reveal is written to the audit log. This is the product's core
 * promise made visible rather than claimed in a settings page.
 */
export function Protected({
  value,
  kind,
  resource,
  resourceId,
  field,
  className,
  mono,
}: ProtectedProps) {
  const router = useRouter();
  const key = revealKey({ resource, resourceId, field });
  const revealed = useCareflow((s) => Boolean(s.revealed[key]));
  const reveal = useCareflow((s) => s.reveal);

  function handleReveal() {
    reveal({ resource, resourceId, field });
    toast(`${field} revealed`, {
      description: `Recorded against ${resourceId} in the audit log.`,
      icon: <ShieldCheck className="size-4 text-ai" aria-hidden />,
      action: { label: "View log", onClick: () => router.push("/admin/audit") },
    });
  }

  if (revealed) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <span className={cn(mono && "text-ident")}>{value}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex size-4 items-center justify-center rounded-[3px] bg-ai-soft text-ai"
              aria-label={`${field} is revealed and this view was recorded`}
            >
              <EyeOff aria-hidden className="size-2.5" strokeWidth={2.5} />
            </span>
          </TooltipTrigger>
          <TooltipContent>Revealed by you · recorded in the audit log</TooltipContent>
        </Tooltip>
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleReveal}
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-[3px] text-left",
            "text-ink-3 transition-colors duration-150 hover:text-ink cursor-pointer",
            className,
          )}
          aria-label={`Reveal ${field}. This will be recorded in the audit log.`}
        >
          <span className={cn("tracking-[0.06em]", mono && "text-ident")} aria-hidden>
            {mask(value, kind)}
          </span>
          <Eye
            aria-hidden
            strokeWidth={2.25}
            className="size-3.5 shrink-0 text-ink-3 transition-colors duration-150 group-hover:text-primary"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>Reveal {field.toLowerCase()} · recorded in the audit log</TooltipContent>
    </Tooltip>
  );
}
