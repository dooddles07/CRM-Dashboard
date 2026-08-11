"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, CircleAlert, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EnrolmentStart } from "@/lib/server/auth/actions";

const LENGTH = 6;

/**
 * task-4-brief.md §3's "enrolment variant": QR + manual key, a verifying
 * code, and — once that code is confirmed — the 10 recovery codes,
 * shown once. Shared by `/mfa` (resumed enrolment, task-4-brief.md §6's
 * abandoned-enrolment case) and `/accept-invite` (fresh acceptance) —
 * both already have an `EnrolmentStart` (totp secret + recovery codes)
 * in hand by the time this renders; only *how* they got it differs.
 */
export function TotpEnrolment({
  enrolment,
  onVerify,
  onDone,
}: {
  enrolment: EnrolmentStart;
  onVerify: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"scan" | "codes">("scan");
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (step === "scan") inputs.current[0]?.focus();
  }, [step]);

  function setDigit(index: number, value: string) {
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(LENGTH).fill("");
    pasted.split("").forEach((c, i) => (next[i] = c));
    setDigits(next);
    inputs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (digits.some((d) => !d)) {
      setError("Enter all six digits from your authenticator app.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await onVerify(digits.join(""));
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "That code isn't valid. Try again.");
      setDigits(Array(LENGTH).fill(""));
      inputs.current[0]?.focus();
      return;
    }
    setStep("codes");
  }

  async function copyAllCodes() {
    try {
      await navigator.clipboard.writeText(enrolment.recoveryCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser — the codes are
      // still on screen and selectable by hand, so this is a nicety, not
      // the only way to save them.
    }
  }

  if (step === "codes") {
    return (
      <>
        <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2">
          <ShieldCheck aria-hidden className="size-4.5" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4 text-h1 text-ink">Save your recovery codes</h1>
        <p className="mt-1.5 text-body-sm text-ink-2">
          Each code signs you in once if you lose access to your authenticator app.
          They are shown only this once — store them somewhere safe.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-line-strong bg-surface-2 p-4 font-mono text-body-sm tabular-nums text-ink">
          {enrolment.recoveryCodes.map((code) => (
            <span key={code}>{code}</span>
          ))}
        </div>

        <Button type="button" variant="outline" className="mt-3 h-9 w-full" onClick={copyAllCodes}>
          {copied ? <Check className="size-4" strokeWidth={1.9} /> : <Copy className="size-4" strokeWidth={1.9} />}
          {copied ? "Copied" : "Copy all codes"}
        </Button>

        <div className="mt-5 flex items-start gap-2">
          <Checkbox id="ack" checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
          <Label htmlFor="ack" className="font-normal text-ink-2">
            I&apos;ve saved these codes somewhere safe. I understand they won&apos;t be shown again.
          </Label>
        </div>

        <Button type="button" className="mt-5 h-10 w-full" disabled={!acknowledged} onClick={onDone}>
          Continue to CareFlow
        </Button>
      </>
    );
  }

  return (
    <>
      <span className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2">
        <ShieldCheck aria-hidden className="size-4.5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-h1 text-ink">Set up two-factor authentication</h1>
      <p className="mt-1.5 text-body-sm text-ink-2">
        Scan this QR code with an authenticator app (like Google Authenticator or 1Password), then
        enter the six-digit code it generates. This is required for every CareFlow account.
      </p>

      <div className="mt-6 flex items-center gap-4 rounded-md border border-line bg-surface-2 p-4">
        <Image
          src={enrolment.qrDataUrl}
          alt="Scan with your authenticator app"
          width={112}
          height={112}
          unoptimized
          className="size-28 shrink-0 rounded-sm border border-line bg-white p-1"
        />
        <div className="min-w-0">
          <p className="text-caption font-medium text-ink-2">Can&apos;t scan it?</p>
          <p className="mt-1 text-caption text-ink-3">Enter this key manually in your authenticator app:</p>
          <p className="mt-1 break-all rounded-sm bg-surface px-2 py-1 font-mono text-caption text-ink">
            {enrolment.manualKey}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        {error && (
          <div role="alert" className="flex gap-2.5 rounded-md border border-danger-line bg-danger-soft px-3 py-2.5">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-danger" strokeWidth={2} />
            <p className="text-body-sm text-danger">{error}</p>
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-body-sm font-medium text-ink">Verification code</legend>
          <div className="flex gap-2" onPaste={onPaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={digit}
                onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, "").slice(-1))}
                onKeyDown={(e) => onKeyDown(i, e)}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={1}
                aria-label={`Digit ${i + 1} of ${LENGTH}`}
                aria-invalid={Boolean(error && !digit)}
                className={cn(
                  "h-12 w-full min-w-0 rounded-md border bg-surface text-center text-h2 text-ink tabular-nums",
                  "transition-colors duration-150 focus-visible:border-primary",
                  error && !digit ? "border-danger" : "border-line-strong",
                )}
              />
            ))}
          </div>
        </fieldset>

        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>
    </>
  );
}
