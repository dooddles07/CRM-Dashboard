"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCareflow, revealKey } from "@/lib/store";
import { revealAction } from "@/app/actions/reveal";
import type { RevealField, RevealResource } from "@/lib/server/services/reveal";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ProtectedProps {
  /**
   * **The masked string, not the real value.**
   *
   * plan/06-screen-migration.md §4: "The `value` prop is no longer the real
   * value. It is the masked string. The real one arrives from the action and
   * lives in the store until `expiresAt`."
   *
   * This is the change that makes the product's promise true rather than
   * demonstrated. Before, the plaintext was in the bundle and this component
   * chose whether to print it — anyone with devtools read it without an audit
   * entry. Now the server never sent it, so there is nothing here to leak.
   */
  masked: string;
  /**
   * Whether to offer the reveal button at all. Comes from the DTO, which got
   * it from `holds(session, "reveal")`.
   *
   * A courtesy, not a control: `revealAction` checks again server-side. It
   * exists so a Marketing user is not offered an action that would 403.
   */
  revealable: boolean;
  resource: RevealResource;
  /** The business reference — `PT-102938`. What the audit entry names. */
  resourceId: string;
  field: RevealField;
  /** Human label for the toast and the aria-label, e.g. "Mobile number". */
  label?: string;
  className?: string;
  /** Renders the value in the identifier face. */
  mono?: boolean;
}

/**
 * Patient contact details stay masked until someone deliberately reveals
 * them, and every reveal is written to the audit log — now by a database
 * transaction that will not return a value unless the entry committed first.
 *
 * The visible contract is unchanged: mask, click, unmask, badge, toast
 * linking to the log. plan §7 lists that as something that must not regress.
 */
export function Protected({
  masked,
  revealable,
  resource,
  resourceId,
  field,
  label,
  className,
  mono,
}: ProtectedProps) {
  const router = useRouter();
  const key = revealKey({ resource, resourceId, field });
  const revealedValue = useCareflow((s) => s.revealed[key]);
  const setRevealed = useCareflow((s) => s.setRevealed);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // No expiry check here: the store schedules the value's own removal when it
  // is stored, so its presence is the whole answer. Comparing Date.now()
  // during render would be an impure call, and React Compiler rejects it.
  const plaintext = revealedValue?.value ?? null;

  const name = label ?? field;

  function handleReveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealAction(resource, resourceId, field);

      if (!result.ok) {
        // The message is written for the person reading it, so it is shown
        // rather than replaced with a generic failure.
        setError(result.message);
        toast.error(result.message);
        return;
      }

      setRevealed(key, result.value, result.expiresAt);
      toast(`${name} revealed`, {
        description: `Recorded against ${resourceId} in the audit log.`,
        icon: <ShieldCheck className="size-4 text-ai" aria-hidden />,
        action: { label: "View log", onClick: () => router.push("/admin/audit") },
      });
    });
  }

  if (plaintext) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
        <span className={cn(mono && "text-ident")}>{plaintext}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex size-4 items-center justify-center rounded-[3px] bg-ai-soft text-ai"
              aria-label={`${name} is revealed and this view was recorded`}
            >
              <EyeOff aria-hidden className="size-2.5" strokeWidth={2.5} />
            </span>
          </TooltipTrigger>
          <TooltipContent>Revealed by you · recorded in the audit log</TooltipContent>
        </Tooltip>
      </span>
    );
  }

  // plan §8: "Protected renders no button when revealable is false." The mask
  // still shows — the caller can see a value exists, just not what it is.
  if (!revealable) {
    return (
      <span
        className={cn("whitespace-nowrap tracking-[0.06em] text-ink-3", mono && "text-ident", className)}
        title={`Your role cannot reveal ${name.toLowerCase()}`}
      >
        {masked}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleReveal}
          disabled={pending}
          className={cn(
            "group inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] text-left",
            "text-ink-3 transition-colors duration-150 hover:text-ink cursor-pointer",
            pending && "opacity-60",
            error && "text-danger",
            className,
          )}
          aria-label={`Reveal ${name}. This will be recorded in the audit log.`}
        >
          <span
            className={cn("whitespace-nowrap tracking-[0.06em]", mono && "text-ident")}
            aria-hidden
          >
            {masked}
          </span>
          <Eye
            aria-hidden
            strokeWidth={2.25}
            className="size-3.5 shrink-0 text-ink-3 transition-colors duration-150 group-hover:text-primary"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {error ?? `Reveal ${name.toLowerCase()} · recorded in the audit log`}
      </TooltipContent>
    </Tooltip>
  );
}
